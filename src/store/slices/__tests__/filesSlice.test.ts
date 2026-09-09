import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileFolder, FileObject } from "@models/files";

import { supabase } from "../../../lib/supabase.js";
import filesReducer, {
  createFolder,
  deleteFile,
  deleteFolder,
  fetchFileTree,
  moveFile,
  renameFolder,
  selectChildFolders,
  selectFolderFiles,
  setCurrentFolder,
  uploadItems,
} from "../filesSlice";

vi.mock("../../../lib/supabase.js", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

// The mock above replaces this import; cast to the mocked-fn shape for the tests.
const mockFrom = supabase.from as unknown as ReturnType<typeof vi.fn>;
const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const mockInvoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const folder = (over: Partial<FileFolder> = {}): FileFolder => ({
  id: "f1",
  owner_admin_id: "admin-1",
  agency_id: null,
  parent_id: null,
  name: "Folder",
  path: "/Folder",
  depth: 0,
  shared: false,
  created_by: "admin-1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const object = (over: Partial<FileObject> = {}): FileObject => ({
  id: "o1",
  owner_admin_id: "admin-1",
  agency_id: null,
  folder_id: null,
  storage_path: "u/admin-1/o1",
  name: "a.pdf",
  mime_type: "application/pdf",
  size_bytes: 1000,
  checksum: null,
  shared: false,
  created_by: "admin-1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const makeStore = (preloaded?: Record<string, unknown>) =>
  configureStore({
    reducer: { files: filesReducer },
    preloadedState: preloaded ? { files: preloaded as never } : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchFileTree", () => {
  it("loads folders, objects and the storage report into state", async () => {
    const folders = [folder(), folder({ id: "f2", parent_id: "f1", name: "Sub", path: "/Folder/Sub", depth: 1 })];
    const objects = [object({ folder_id: "f1" })];
    mockFrom.mockImplementation((table: string) => ({
      select: () => ({
        order: () => Promise.resolve({ data: table === "file_folders" ? folders : objects, error: null }),
      }),
    }));
    mockRpc.mockResolvedValue({
      data: { used_bytes: 1000, quota_bytes: 2684354560, pool: "practice" },
      error: null,
    });

    const store = makeStore();
    await store.dispatch(fetchFileTree());

    const s = store.getState().files;
    expect(s.status).toBe("succeeded");
    expect(s.folders).toHaveLength(2);
    expect(s.objects).toHaveLength(1);
    expect(s.report?.quota_bytes).toBe(2684354560);
  });
});

describe("reducers", () => {
  it("createFolder.fulfilled appends the new folder", () => {
    const store = makeStore({ ...initial(), folders: [folder()] });
    store.dispatch({ type: createFolder.fulfilled.type, payload: folder({ id: "f2", name: "New" }) });
    expect(store.getState().files.folders.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("deleteFolder.fulfilled removes the folder, its whole subtree and their files", () => {
    const folders = [
      folder({ id: "root" }),
      folder({ id: "mid", parent_id: "root" }),
      folder({ id: "leaf", parent_id: "mid" }),
      folder({ id: "other" }),
    ];
    const objects = [
      object({ id: "o-mid", folder_id: "mid" }),
      object({ id: "o-leaf", folder_id: "leaf" }),
      object({ id: "o-other", folder_id: "other" }),
    ];
    const store = makeStore({ ...initial(), folders, objects, currentFolderId: "leaf" });
    store.dispatch({ type: deleteFolder.fulfilled.type, payload: "root" });

    const s = store.getState().files;
    expect(s.folders.map((f) => f.id)).toEqual(["other"]);
    expect(s.objects.map((o) => o.id)).toEqual(["o-other"]);
    expect(s.currentFolderId).toBeNull(); // we were inside the deleted subtree
  });

  it("renameFolder.fulfilled swaps in the re-materialised folder list", () => {
    const store = makeStore({ ...initial(), folders: [folder({ name: "Old" })] });
    store.dispatch({ type: renameFolder.fulfilled.type, payload: [folder({ name: "New", path: "/New" })] });
    expect(store.getState().files.folders[0].name).toBe("New");
  });

  it("moveFile.fulfilled updates the file's folder in place", () => {
    const store = makeStore({ ...initial(), objects: [object({ folder_id: null })] });
    store.dispatch({ type: moveFile.fulfilled.type, payload: object({ folder_id: "f1" }) });
    expect(store.getState().files.objects[0].folder_id).toBe("f1");
  });

  it("deleteFile.fulfilled drops the file", () => {
    const store = makeStore({ ...initial(), objects: [object(), object({ id: "o2" })] });
    store.dispatch({ type: deleteFile.fulfilled.type, payload: "o2" });
    expect(store.getState().files.objects.map((o) => o.id)).toEqual(["o1"]);
  });

  it("uploadItems.rejected stores the message and the rejected list", () => {
    const store = makeStore(initial());
    store.dispatch({
      type: uploadItems.rejected.type,
      payload: { message: "Nothing was imported", rejected: [{ path: "clip.mp4", reason: "file type not allowed" }] },
    });
    const s = store.getState().files;
    expect(s.uploadStatus).toBe("failed");
    expect(s.error).toBe("Nothing was imported");
    expect(s.lastRejected).toEqual([{ path: "clip.mp4", reason: "file type not allowed" }]);
  });

  it("setCurrentFolder navigates", () => {
    const store = makeStore(initial());
    store.dispatch(setCurrentFolder("f1"));
    expect(store.getState().files.currentFolderId).toBe("f1");
  });
});

describe("uploadItems thunk", () => {
  it("surfaces the edge function's whole-batch rejection with its file list", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("HTTP 422"), {
        context: {
          json: () =>
            Promise.resolve({ message: "Upload cancelled", rejected: [{ path: "x.exe", reason: "not allowed" }] }),
        },
      }),
    });

    const store = makeStore(initial());
    const file = new File([new Uint8Array([1, 2, 3])], "x.exe");
    const res = await store.dispatch(uploadItems({ folderId: null, files: [file] }));

    expect(res.type).toBe(uploadItems.rejected.type);
    const s = store.getState().files;
    expect(s.error).toBe("Upload cancelled");
    expect(s.lastRejected).toEqual([{ path: "x.exe", reason: "not allowed" }]);
  });
});

describe("selectors", () => {
  it("selectChildFolders / selectFolderFiles scope to the given folder", () => {
    const state = {
      files: {
        ...initial(),
        folders: [folder({ id: "a" }), folder({ id: "b", parent_id: "a" }), folder({ id: "c", parent_id: "a" })],
        objects: [object({ id: "o1", folder_id: "a" }), object({ id: "o2", folder_id: null })],
      },
    } as never;
    expect(selectChildFolders("a")(state).map((f) => f.id)).toEqual(["b", "c"]);
    expect(selectFolderFiles("a")(state).map((o) => o.id)).toEqual(["o1"]);
    expect(selectFolderFiles(null)(state).map((o) => o.id)).toEqual(["o2"]);
  });
});

function initial() {
  return {
    folders: [],
    objects: [],
    report: null,
    status: "succeeded",
    uploadStatus: "idle",
    currentFolderId: null,
    error: null,
    lastRejected: null,
  };
}
