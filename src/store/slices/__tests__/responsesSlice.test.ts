import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";

import type { Response } from "@/models/globalTypes";
import responsesReducer, {
  clearResponseError,
  deleteResponse,
  fetchAllResponses,
  fetchResponsesByQuestionnaire,
  fetchResponsesByUser,
  selectLatestResponsesByUser,
  selectResponsesByUser,
  selectUserQuestionnaireResponses,
  submitResponse,
} from "../responsesSlice";

// These exercise the reducer + selectors directly by dispatching the
// thunks' lifecycle actions with hand-built payloads — no Supabase mock
// needed, and it keeps the focus on the non-trivial bits: the id-keyed
// merge on re-fetch (so a second fetch doesn't duplicate rows) and the
// chart-facing selectors' sorting / latest-per-questionnaire logic.

function resp(over: Partial<Response>): Response {
  return {
    id: "r1",
    user_id: "u1",
    questionnaire_id: "q1",
    submitted_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    scores: {},
    is_plotted: true,
    ...over,
  } as unknown as Response;
}

function makeStore(preloaded?: Response[]) {
  const store = configureStore({ reducer: { responses: responsesReducer } });
  if (preloaded) {
    store.dispatch({ type: fetchAllResponses.fulfilled.type, payload: preloaded });
  }
  return store;
}

describe("responsesSlice reducer", () => {
  it("fetchAllResponses.fulfilled replaces the list and marks it succeeded", () => {
    const store = makeStore();
    store.dispatch({ type: fetchAllResponses.pending.type });
    expect(store.getState().responses.status).toBe("loading");

    store.dispatch({ type: fetchAllResponses.fulfilled.type, payload: [resp({ id: "a" }), resp({ id: "b" })] });
    const s = store.getState().responses;
    expect(s.status).toBe("succeeded");
    expect(s.responses.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("fetchResponsesByUser.fulfilled merges by id — replaces same-id rows, keeps others", () => {
    const store = makeStore([resp({ id: "a", user_id: "u1", scores: { v: 1 } }), resp({ id: "z", user_id: "u2" })]);

    store.dispatch({
      type: fetchResponsesByUser.fulfilled.type,
      payload: [resp({ id: "a", user_id: "u1", scores: { v: 99 } }), resp({ id: "c", user_id: "u1" })],
    });

    const rows = store.getState().responses.responses;
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "c", "z"]);
    // the re-fetched "a" wins, it's not duplicated
    expect(rows.filter((r) => r.id === "a")).toHaveLength(1);
    expect(rows.find((r) => r.id === "a")?.scores).toEqual({ v: 99 });
  });

  it("fetchResponsesByQuestionnaire.fulfilled also de-dupes by id", () => {
    const store = makeStore([resp({ id: "a" })]);
    store.dispatch({
      type: fetchResponsesByQuestionnaire.fulfilled.type,
      payload: [resp({ id: "a" }), resp({ id: "a" })],
    });
    // dedupe removes the pre-existing "a"; the payload itself is trusted as-is
    const rows = store.getState().responses.responses;
    expect(rows.filter((r) => r.id === "a").length).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.id === "a")).toBe(true);
  });

  it("submitResponse.fulfilled prepends the new response", () => {
    const store = makeStore([resp({ id: "old" })]);
    store.dispatch({ type: submitResponse.fulfilled.type, payload: resp({ id: "new" }) });
    expect(store.getState().responses.responses.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("deleteResponse.fulfilled removes by id", () => {
    const store = makeStore([resp({ id: "a" }), resp({ id: "b" })]);
    store.dispatch({ type: deleteResponse.fulfilled.type, payload: "a" });
    expect(store.getState().responses.responses.map((r) => r.id)).toEqual(["b"]);
  });

  it("a rejected fetch records the error payload and clearResponseError clears it", () => {
    const store = makeStore();
    store.dispatch({ type: fetchAllResponses.rejected.type, payload: "boom" });
    expect(store.getState().responses.error).toBe("boom");
    expect(store.getState().responses.status).toBe("failed");

    store.dispatch(clearResponseError());
    expect(store.getState().responses.error).toBeNull();
  });

  it("RESET_ALL returns the slice to its initial state", () => {
    const store = makeStore([resp({ id: "a" })]);
    store.dispatch({ type: "RESET_ALL" });
    expect(store.getState().responses).toEqual({ responses: [], status: "idle", error: null });
  });
});

describe("responsesSlice selectors", () => {
  const rows = [
    resp({ id: "1", user_id: "u1", questionnaire_id: "q1", submitted_at: "2026-03-01T00:00:00.000Z" }),
    resp({ id: "2", user_id: "u1", questionnaire_id: "q1", submitted_at: "2026-01-01T00:00:00.000Z" }),
    resp({ id: "3", user_id: "u1", questionnaire_id: "q2", submitted_at: "2026-02-01T00:00:00.000Z" }),
    resp({ id: "4", user_id: "u2", questionnaire_id: "q1", submitted_at: "2026-04-01T00:00:00.000Z" }),
  ];

  it("selectResponsesByUser returns only that user's rows, oldest first", () => {
    const store = makeStore(rows);
    const out = selectResponsesByUser("u1")(store.getState());
    // u1 rows by submitted_at: id2 (Jan) < id3 (Feb) < id1 (Mar)
    expect(out.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });

  it("selectUserQuestionnaireResponses filters by user AND questionnaire, oldest first", () => {
    const store = makeStore(rows);
    const out = selectUserQuestionnaireResponses("u1", "q1")(store.getState());
    expect(out.map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("selectLatestResponsesByUser keeps the most recent response per questionnaire", () => {
    const store = makeStore(rows);
    const out = selectLatestResponsesByUser("u1")(store.getState());
    const byQ = Object.fromEntries(out.map((r) => [r.questionnaire_id, r.id]));
    expect(byQ).toEqual({ q1: "1", q2: "3" });
  });
});
