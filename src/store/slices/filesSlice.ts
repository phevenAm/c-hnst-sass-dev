import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { isRelPathSafe, isZip, readFileAsBase64 } from "@Helpers/fileTypes";
import type { FileFolder, FileObject, RejectedUpload, StorageReport } from "@models/files";

import { supabase } from "../../lib/supabase.js";

type Status = "idle" | "loading" | "succeeded" | "failed";

// Keep a single "files" upload call comfortably under the edge function's
// MAX_BATCH_BYTES / MAX_BATCH_FILES; a folder drop with hundreds of files is
// split into several calls.
const UPLOAD_BATCH_BYTES = 12 * 1024 * 1024;
const UPLOAD_BATCH_FILES = 80;

export type FilesState = {
  folders: FileFolder[];
  objects: FileObject[];
  report: StorageReport | null;
  status: Status; // tree + report load
  uploadStatus: Status;
  currentFolderId: string | null;
  error: string | null;
  /** Files the last upload refused (whole-batch reject) — surfaced once, then cleared. */
  lastRejected: RejectedUpload[] | null;
};

const initialState: FilesState = {
  folders: [],
  objects: [],
  report: null,
  status: "idle",
  uploadStatus: "idle",
  currentFolderId: null,
  error: null,
  lastRejected: null,
};

// ── Edge-function helper ───────────────────────────────────────────────────
// file-upload returns { error, message, rejected? } with a 4xx/5xx. Dig the
// real message + rejected list out of whatever shape supabase-js hands back.
type UploadResult = {
  ok: true;
  created: { id: string; name: string; folderId: string | null; sizeBytes: number }[];
  foldersCreated: number;
};

async function invokeUpload(body: Record<string, unknown>): Promise<UploadResult> {
  const { data, error } = await supabase.functions.invoke("file-upload", { body });
  if (error) {
    let payload: unknown;
    const ctx = (error as { context?: unknown }).context;
    try {
      if (ctx && typeof (ctx as Response).json === "function") payload = await (ctx as Response).json();
      else if (ctx && typeof (ctx as { body?: unknown }).body === "string")
        payload = JSON.parse((ctx as { body: string }).body);
      else payload = (ctx as { body?: unknown })?.body;
    } catch {
      /* fall back to error.message */
    }
    const p = payload as { message?: string; error?: string; rejected?: RejectedUpload[] } | undefined;
    const err = new Error(p?.message || p?.error || error.message) as Error & { rejected?: RejectedUpload[] };
    if (p?.rejected) err.rejected = p.rejected;
    throw err;
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as UploadResult;
}

// ── Reads ─────────────────────────────────────────────────────────────────
export const fetchFileTree = createAsyncThunk("files/fetchTree", async (_, { rejectWithValue }) => {
  const [foldersRes, objectsRes, reportRes] = await Promise.all([
    supabase.from("file_folders").select("*").order("path", { ascending: true }),
    supabase.from("file_objects").select("*").order("name", { ascending: true }),
    supabase.rpc("file_storage_report"),
  ]);
  if (foldersRes.error) return rejectWithValue(foldersRes.error.message);
  if (objectsRes.error) return rejectWithValue(objectsRes.error.message);
  if (reportRes.error) return rejectWithValue(reportRes.error.message);
  return {
    folders: (foldersRes.data ?? []) as FileFolder[],
    objects: (objectsRes.data ?? []) as FileObject[],
    report: (reportRes.data ?? null) as StorageReport | null,
  };
});

export const refreshStorageReport = createAsyncThunk("files/refreshReport", async (_, { rejectWithValue }) => {
  const { data, error } = await supabase.rpc("file_storage_report");
  if (error) return rejectWithValue(error.message);
  return data as StorageReport;
});

// ── Folder writes (direct table — RLS + triggers enforce scope) ────────────
export const createFolder = createAsyncThunk(
  "files/createFolder",
  async (payload: { parentId: string | null; name: string }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("file_folders")
      .insert({ parent_id: payload.parentId, name: payload.name })
      .select()
      .single();
    if (error) return rejectWithValue(friendlyFolderError(error.message));
    return data as FileFolder;
  },
);

export const renameFolder = createAsyncThunk(
  "files/renameFolder",
  async (payload: { id: string; name: string }, { rejectWithValue }) => {
    // path/depth of this folder AND its whole subtree are re-materialised by the
    // DB trigger, so pull the fresh rows back rather than patching locally.
    const { error } = await supabase.from("file_folders").update({ name: payload.name }).eq("id", payload.id);
    if (error) return rejectWithValue(friendlyFolderError(error.message));
    const { data, error: reErr } = await supabase.from("file_folders").select("*");
    if (reErr) return rejectWithValue(reErr.message);
    return data as FileFolder[];
  },
);

export const moveFolder = createAsyncThunk(
  "files/moveFolder",
  async (payload: { id: string; parentId: string | null }, { rejectWithValue }) => {
    const { error } = await supabase.from("file_folders").update({ parent_id: payload.parentId }).eq("id", payload.id);
    if (error) return rejectWithValue(friendlyFolderError(error.message));
    const { data, error: reErr } = await supabase.from("file_folders").select("*");
    if (reErr) return rejectWithValue(reErr.message);
    return data as FileFolder[];
  },
);

export const deleteFolder = createAsyncThunk(
  "files/deleteFolder",
  async (id: string, { rejectWithValue, dispatch }) => {
    const { error } = await supabase.from("file_folders").delete().eq("id", id);
    if (error) return rejectWithValue(error.message);
    dispatch(refreshStorageReport());
    return id;
  },
);

// ── File writes ───────────────────────────────────────────────────────────
export const renameFile = createAsyncThunk(
  "files/renameFile",
  async (payload: { id: string; name: string }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("file_objects")
      .update({ name: payload.name })
      .eq("id", payload.id)
      .select()
      .single();
    if (error) return rejectWithValue(friendlyFolderError(error.message));
    return data as FileObject;
  },
);

export const moveFile = createAsyncThunk(
  "files/moveFile",
  async (payload: { id: string; folderId: string | null }, { rejectWithValue }) => {
    const { data, error } = await supabase
      .from("file_objects")
      .update({ folder_id: payload.folderId })
      .eq("id", payload.id)
      .select()
      .single();
    if (error) return rejectWithValue(friendlyFolderError(error.message));
    return data as FileObject;
  },
);

export const deleteFile = createAsyncThunk("files/deleteFile", async (id: string, { rejectWithValue, dispatch }) => {
  const { error } = await supabase.from("file_objects").delete().eq("id", id);
  if (error) return rejectWithValue(error.message);
  dispatch(refreshStorageReport());
  return id;
});

// ── Upload (edge function) ────────────────────────────────────────────────
// `files` may include a single .zip (expanded server-side) or any number of
// allowed files, each carrying its folder-relative path (webkitRelativePath for
// a folder drop). A disallowed entry anywhere makes the WHOLE upload fail.
export const uploadItems = createAsyncThunk(
  "files/upload",
  async (payload: { folderId: string | null; files: File[] }, { rejectWithValue, dispatch }) => {
    const { folderId, files } = payload;
    try {
      const summary = { created: 0, foldersCreated: 0 };

      const zips = files.filter(isZip);
      const plain = files.filter((f) => !isZip(f));

      for (const zip of zips) {
        const res = await invokeUpload({ mode: "zip", folderId, zipBase64: await readFileAsBase64(zip) });
        summary.created += res.created.length;
        summary.foldersCreated += res.foldersCreated;
      }

      // batch the plain files
      let batch: { path: string; dataBase64: string }[] = [];
      let batchBytes = 0;
      const flush = async () => {
        if (!batch.length) return;
        const res = await invokeUpload({ mode: "files", folderId, items: batch });
        summary.created += res.created.length;
        summary.foldersCreated += res.foldersCreated;
        batch = [];
        batchBytes = 0;
      };
      for (const file of plain) {
        const rel = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        if (!isRelPathSafe(rel)) return rejectWithValue(`"${file.name}" has an unsafe path and was not uploaded.`);
        if (batch.length >= UPLOAD_BATCH_FILES || batchBytes + file.size > UPLOAD_BATCH_BYTES) await flush();
        batch.push({ path: rel, dataBase64: await readFileAsBase64(file) });
        batchBytes += file.size;
      }
      await flush();

      await dispatch(fetchFileTree());
      return summary;
    } catch (e) {
      const err = e as Error & { rejected?: RejectedUpload[] };
      return rejectWithValue({ message: err.message, rejected: err.rejected ?? null });
    }
  },
);

// ── Error prettifiers ─────────────────────────────────────────────────────
function friendlyFolderError(msg: string): string {
  if (msg.includes("FOLDER_CYCLE")) return "You can't move a folder into itself or one of its own subfolders.";
  if (msg.includes("FOLDER_TOO_DEEP")) return "That would nest folders more than 20 levels deep.";
  if (
    msg.includes("file_folders_sibling_uniq") ||
    msg.includes("file_objects_name_uniq") ||
    msg.includes("duplicate key")
  )
    return "There's already an item with that name here.";
  if (msg.includes("file_folders_name_slash")) return "Folder names can't contain a slash.";
  if (msg.includes("FILE_IMMUTABLE_COLUMN")) return "Only the name and location of a file can be changed.";
  return msg;
}

// ── Slice ─────────────────────────────────────────────────────────────────
const filesSlice = createSlice({
  name: "files",
  initialState,
  reducers: {
    setCurrentFolder(state, action: { payload: string | null }) {
      state.currentFolderId = action.payload;
    },
    clearFilesError(state) {
      state.error = null;
    },
    clearRejected(state) {
      state.lastRejected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFileTree.pending, (state) => {
        if (state.status === "idle") state.status = "loading";
      })
      .addCase(fetchFileTree.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.folders = action.payload.folders;
        state.objects = action.payload.objects;
        state.report = action.payload.report;
        // the folder we were in might have been deleted by another session
        if (state.currentFolderId && !state.folders.some((f) => f.id === state.currentFolderId)) {
          state.currentFolderId = null;
        }
      })
      .addCase(fetchFileTree.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload as string;
      })

      .addCase(refreshStorageReport.fulfilled, (state, action) => {
        state.report = action.payload;
      })

      .addCase(createFolder.fulfilled, (state, action) => {
        state.folders.push(action.payload);
      })

      .addCase(renameFolder.fulfilled, (state, action) => {
        state.folders = action.payload;
      })
      .addCase(moveFolder.fulfilled, (state, action) => {
        state.folders = action.payload;
      })

      .addCase(deleteFolder.fulfilled, (state, action) => {
        const removed = collectSubtree(action.payload, state.folders);
        state.folders = state.folders.filter((f) => !removed.has(f.id));
        state.objects = state.objects.filter((o) => !o.folder_id || !removed.has(o.folder_id));
        if (state.currentFolderId && removed.has(state.currentFolderId)) state.currentFolderId = null;
      })

      .addCase(renameFile.fulfilled, (state, action) => {
        upsertObject(state, action.payload);
      })
      .addCase(moveFile.fulfilled, (state, action) => {
        upsertObject(state, action.payload);
      })
      .addCase(deleteFile.fulfilled, (state, action) => {
        state.objects = state.objects.filter((o) => o.id !== action.payload);
      })

      .addCase(uploadItems.pending, (state) => {
        state.uploadStatus = "loading";
        state.lastRejected = null;
      })
      .addCase(uploadItems.fulfilled, (state) => {
        state.uploadStatus = "succeeded";
      })
      .addCase(uploadItems.rejected, (state, action) => {
        state.uploadStatus = "failed";
        const p = action.payload as { message: string; rejected: RejectedUpload[] | null } | string | undefined;
        if (typeof p === "string") state.error = p;
        else if (p) {
          state.error = p.message;
          state.lastRejected = p.rejected;
        }
      })

      .addCase("RESET_ALL", () => initialState)

      .addMatcher(
        (a): a is { type: string; payload: unknown } =>
          a.type.startsWith("files/") && a.type.endsWith("/rejected") && a.type !== uploadItems.rejected.type,
        (state, action) => {
          if (typeof action.payload === "string") state.error = action.payload;
        },
      );
  },
});

// ── local helpers ─────────────────────────────────────────────────────────
function collectSubtree(rootId: string, folders: FileFolder[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parent_id) continue;
    const list = childrenOf.get(f.parent_id);
    if (list) list.push(f.id);
    else childrenOf.set(f.parent_id, [f.id]);
  }
  const out = new Set<string>([rootId]);
  const stack: string[] = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id) break;
    for (const child of childrenOf.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

function upsertObject(state: FilesState, obj: FileObject) {
  const idx = state.objects.findIndex((o) => o.id === obj.id);
  if (idx === -1) state.objects.push(obj);
  else state.objects[idx] = obj;
}

export const { setCurrentFolder, clearFilesError, clearRejected } = filesSlice.actions;

// ── Selectors ─────────────────────────────────────────────────────────────
type WithFiles = { files: FilesState };
export const selectFileFolders = (s: WithFiles) => s.files.folders;
export const selectFileObjects = (s: WithFiles) => s.files.objects;
export const selectFilesStatus = (s: WithFiles) => s.files.status;
export const selectFilesUploadStatus = (s: WithFiles) => s.files.uploadStatus;
export const selectStorageReport = (s: WithFiles) => s.files.report;
export const selectCurrentFolderId = (s: WithFiles) => s.files.currentFolderId;
export const selectFilesError = (s: WithFiles) => s.files.error;
export const selectLastRejected = (s: WithFiles) => s.files.lastRejected;

export const selectChildFolders = (parentId: string | null) => (s: WithFiles) =>
  s.files.folders
    .filter((f) => f.parent_id === parentId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

export const selectFolderFiles = (folderId: string | null) => (s: WithFiles) =>
  s.files.objects
    .filter((o) => o.folder_id === folderId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

export default filesSlice.reducer;
