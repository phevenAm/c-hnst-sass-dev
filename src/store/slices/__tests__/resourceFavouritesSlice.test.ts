import { describe, expect, it } from "vitest";

import reducer, { fetchMyFavourites, toggleFavourite } from "../resourceFavouritesSlice";

const initial = { ids: [] as string[], status: "idle" as const, error: null };

describe("resourceFavourites reducer", () => {
  it("stores fetched favourite ids", () => {
    const state = reducer(initial, fetchMyFavourites.fulfilled(["a", "b"], "", undefined));
    expect(state.status).toBe("succeeded");
    expect(state.ids).toEqual(["a", "b"]);
  });

  it("adds an id when a favourite is turned on", () => {
    const state = reducer(
      { ...initial, ids: ["a"] },
      toggleFavourite.fulfilled({ resourceId: "b", on: true }, "", { resourceId: "b", userId: "u", on: true }),
    );
    expect(state.ids).toEqual(["a", "b"]);
  });

  it("removes an id when a favourite is turned off", () => {
    const state = reducer(
      { ...initial, ids: ["a", "b"] },
      toggleFavourite.fulfilled({ resourceId: "a", on: false }, "", { resourceId: "a", userId: "u", on: false }),
    );
    expect(state.ids).toEqual(["b"]);
  });

  it("does not duplicate an already-favourited id", () => {
    const state = reducer(
      { ...initial, ids: ["a"] },
      toggleFavourite.fulfilled({ resourceId: "a", on: true }, "", { resourceId: "a", userId: "u", on: true }),
    );
    expect(state.ids).toEqual(["a"]);
  });
});
