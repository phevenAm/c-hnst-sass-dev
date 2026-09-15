import { configureStore } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";

import userDirectoryReducer, {
  archiveClient,
  deleteOwnAccount,
  deleteUser,
  selectAllUsers,
  unarchiveClient,
} from "./userDirectorySlice";

// Client lifecycle (migration 20260901000000/0001/0002): "deactivate" a client
// via admin_archive_client / admin_unarchive_client, and the client-facing
// "close account" via delete_own_account (which now archives + anonymises
// server-side instead of hard-deleting). A mocked unit test can't assert the
// SQL side, so these lock in the RPC name + args and the local state shape.

const { supabaseMock, rpcSpy } = vi.hoisted(() => {
  const rpcSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return { supabaseMock: { rpc: rpcSpy }, rpcSpy };
});
vi.mock("../../lib/supabase.js", () => ({ supabase: supabaseMock }));

afterEach(() => {
  vi.clearAllMocks();
  rpcSpy.mockImplementation(() => Promise.resolve({ data: null, error: null }));
});

const client = (over: Record<string, unknown> = {}) => ({
  id: "client-1",
  role: "client",
  first_name: "Ada",
  last_name: "Lovelace",
  display_name: "Ada Lovelace",
  disabled: false,
  archived_at: null,
  anonymised_at: null,
  ...over,
});

function makeStore(users: Record<string, unknown>[] = [client()]) {
  return configureStore({
    reducer: { userDirectory: userDirectoryReducer },
    preloadedState: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal preloaded slice for the test
      userDirectory: { users: users as any, status: "succeeded" as const, error: null },
    },
  });
}

describe("archiveClient", () => {
  it("calls admin_archive_client with the id and no anonymise by default", async () => {
    const store = makeStore();
    await store.dispatch(archiveClient({ id: "client-1" }));

    expect(rpcSpy).toHaveBeenCalledWith("admin_archive_client", {
      target_user_id: "client-1",
      p_reason: null,
      p_anonymise: false,
    });
  });

  it("passes the reason and anonymise flag through when given", async () => {
    const store = makeStore();
    await store.dispatch(archiveClient({ id: "client-1", reason: "moved away", anonymise: true }));

    expect(rpcSpy).toHaveBeenCalledWith("admin_archive_client", {
      target_user_id: "client-1",
      p_reason: "moved away",
      p_anonymise: true,
    });
  });

  it("marks the client archived + disabled in state, keeping the row", async () => {
    const store = makeStore();
    await store.dispatch(archiveClient({ id: "client-1" }));

    const [u] = selectAllUsers(store.getState());
    expect(u.id).toBe("client-1");
    expect(u.archived_at).toEqual(expect.any(String));
    expect(u.disabled).toBe(true);
    expect(u.anonymised_at).toBeNull();
    // still present — archive is not a delete
    expect(selectAllUsers(store.getState())).toHaveLength(1);
  });

  it("also scrubs the name locally when anonymise is true", async () => {
    const store = makeStore();
    await store.dispatch(archiveClient({ id: "client-1", anonymise: true }));

    const [u] = selectAllUsers(store.getState());
    expect(u.anonymised_at).toEqual(expect.any(String));
    expect(u.first_name).toBe("");
    expect(u.last_name).toBe("");
    expect(u.display_name).toBeNull();
  });

  it("surfaces a rejected RPC via state.error and leaves the client untouched", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: "not part of your practice" } });
    const store = makeStore();

    const result = await store.dispatch(archiveClient({ id: "client-1" }));

    expect(archiveClient.rejected.match(result)).toBe(true);
    expect(store.getState().userDirectory.error).toMatch(/not part of your practice/);
    expect(selectAllUsers(store.getState())[0].archived_at).toBeNull();
  });
});

describe("unarchiveClient", () => {
  it("calls admin_unarchive_client with the id", async () => {
    const store = makeStore([client({ archived_at: "2026-08-01T00:00:00Z", disabled: true })]);
    await store.dispatch(unarchiveClient("client-1"));

    expect(rpcSpy).toHaveBeenCalledWith("admin_unarchive_client", { target_user_id: "client-1" });
  });

  it("clears archived_at / archived_reason / disabled in state", async () => {
    const store = makeStore([client({ archived_at: "2026-08-01T00:00:00Z", archived_reason: "x", disabled: true })]);
    await store.dispatch(unarchiveClient("client-1"));

    const [u] = selectAllUsers(store.getState());
    expect(u.archived_at).toBeNull();
    expect(u.archived_reason).toBeNull();
    expect(u.disabled).toBe(false);
  });

  it("does not un-anonymise a client whose PII was already scrubbed", async () => {
    const store = makeStore([
      client({ archived_at: "2026-08-01T00:00:00Z", anonymised_at: "2026-08-01T00:00:00Z", first_name: "" }),
    ]);
    await store.dispatch(unarchiveClient("client-1"));

    const [u] = selectAllUsers(store.getState());
    expect(u.archived_at).toBeNull();
    expect(u.anonymised_at).toBe("2026-08-01T00:00:00Z");
    expect(u.first_name).toBe("");
  });

  it("surfaces a rejected RPC via state.error", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: "Unauthorized" } });
    const store = makeStore([client({ archived_at: "2026-08-01T00:00:00Z" })]);

    const result = await store.dispatch(unarchiveClient("client-1"));

    expect(unarchiveClient.rejected.match(result)).toBe(true);
    expect(store.getState().userDirectory.error).toMatch(/Unauthorized/);
  });
});

// deleteUser (admin hard-delete via DeleteClientModal) is a different RPC/path
// from deleteOwnAccount above (client "close account", which archives +
// anonymises server-side) — this one had zero coverage anywhere before.
describe("deleteUser", () => {
  it("calls delete_user_by_id with the target user's id", async () => {
    const store = makeStore();
    await store.dispatch(deleteUser("client-1"));

    expect(rpcSpy).toHaveBeenCalledWith("delete_user_by_id", { target_user_id: "client-1" });
  });

  it("drops the user from the local directory on success", async () => {
    const store = makeStore();
    await store.dispatch(deleteUser("client-1"));

    expect(selectAllUsers(store.getState())).toHaveLength(0);
  });

  it("surfaces a rejected RPC via state.error and leaves the user in place (sad path)", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: "not part of your practice" } });
    const store = makeStore();

    const result = await store.dispatch(deleteUser("client-1"));

    expect(deleteUser.rejected.match(result)).toBe(true);
    expect(store.getState().userDirectory.error).toMatch(/not part of your practice/);
    expect(selectAllUsers(store.getState())).toHaveLength(1);
  });

  // Edge case: a thrown/rejected RPC call (network drop, timeout) is a
  // different failure shape from an RPC that resolves with { error } (a
  // clean server-side rejection) — createAsyncThunk still turns it into a
  // `rejected` action, but WITHOUT going through rejectWithValue, so
  // action.payload (what the reducer reads into state.error) is undefined
  // rather than a message. Documents that this path degrades to a blank
  // error instead of crashing — not "handled well", just not fatal.
  it("does not crash when the RPC call itself rejects (network failure) instead of resolving with { error }", async () => {
    rpcSpy.mockRejectedValueOnce(new Error("network request failed"));
    const store = makeStore();

    const result = await store.dispatch(deleteUser("client-1"));

    expect(deleteUser.rejected.match(result)).toBe(true);
    expect(store.getState().userDirectory.error).toBeUndefined();
    expect(selectAllUsers(store.getState())).toHaveLength(1);
  });
});

describe("deleteOwnAccount", () => {
  it("calls the delete_own_account RPC (which archives + anonymises server-side)", async () => {
    const store = makeStore();
    await store.dispatch(deleteOwnAccount("client-1"));

    expect(rpcSpy).toHaveBeenCalledWith("delete_own_account");
  });

  it("drops the user from the local directory on success", async () => {
    const store = makeStore();
    await store.dispatch(deleteOwnAccount("client-1"));

    expect(selectAllUsers(store.getState())).toHaveLength(0);
  });
});
