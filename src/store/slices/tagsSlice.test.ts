import { configureStore } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";

import tagsReducer, { createTag, deleteTag, selectAllTags } from "./tagsSlice";

// Regression coverage (2026-08-26): tags.admin_id is NOT NULL with no
// default, and createTag's insert payload only ever sent { name } — every
// tag creation failed with a silent 23502 not-null violation. Fixed via
// migration 20260826000020_tags_admin_id_default.sql (admin_id now defaults
// to auth.uid() server-side), so the frontend payload correctly stays
// name-only — these tests lock in that shape and the success/failure
// behavior around it, since a live DB constraint can't be asserted from a
// mocked unit test.

const { supabaseMock, insertSpy } = vi.hoisted(() => {
  const insertSpy = vi.fn();
  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table !== "tags") throw new Error(`Unexpected table in test: ${table}`);
      return {
        insert: (payload: Record<string, unknown>) => {
          insertSpy(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "tag-1", name: payload.name, admin_id: "admin-1" }, error: null }),
            }),
          };
        },
      };
    }),
  };
  return { supabaseMock, insertSpy };
});
vi.mock("@/lib/supabase.js", () => ({ supabase: supabaseMock }));

afterEach(() => {
  vi.clearAllMocks();
});

function makeStore() {
  return configureStore({ reducer: { tags: tagsReducer } });
}

describe("createTag", () => {
  it("sends only { name } — admin_id is stamped server-side by the column default, not the client", async () => {
    const store = makeStore();
    await store.dispatch(createTag({ name: "Mood" }));

    expect(insertSpy).toHaveBeenCalledWith({ name: "Mood" });
    expect(insertSpy).not.toHaveBeenCalledWith(expect.objectContaining({ admin_id: expect.anything() }));
  });

  it("adds the created tag to state, sorted by name", async () => {
    const store = makeStore();
    await store.dispatch(createTag({ name: "Mood" }));

    expect(selectAllTags(store.getState())).toEqual([{ id: "tag-1", name: "Mood", admin_id: "admin-1" }]);
  });

  it("surfaces a rejected insert (e.g. the not-null violation this bug caused) via state.error instead of silently succeeding", async () => {
    const supabaseModule = await import("@/lib/supabase.js");
    // biome-ignore lint/suspicious/noExplicitAny: overriding the hoisted mock for this one test
    (supabaseModule.supabase.from as any).mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: null,
              error: { message: 'null value in column "admin_id" violates not-null constraint' },
            }),
        }),
      }),
    });

    const store = makeStore();
    const result = await store.dispatch(createTag({ name: "Mood" }));

    expect(createTag.rejected.match(result)).toBe(true);
    expect(selectAllTags(store.getState())).toEqual([]);
    expect(store.getState().tags.error).toMatch(/not-null constraint/);
  });
});

describe("deleteTag", () => {
  it("removes the tag from state on success", async () => {
    const store = configureStore({
      reducer: { tags: tagsReducer },
      preloadedState: {
        tags: { tags: [{ id: "tag-1", name: "Mood", admin_id: "admin-1" }], status: "succeeded" as const, error: null },
      },
    });
    vi.mocked(supabaseMock.from).mockReturnValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal delete-chain stub for this one call
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    } as any);

    await store.dispatch(deleteTag("tag-1"));

    expect(selectAllTags(store.getState())).toEqual([]);
  });
});
