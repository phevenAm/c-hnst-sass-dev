import { describe, expect, it } from "vitest";

import { Session } from "../../../models/globalTypes";
import sessionsReducer, {
  createSession,
  fetchAllSessions,
  fetchSessionsByClientId,
  updateSession,
  upsertSession,
} from "../sessionsSlice";

// Regression coverage for the "sessions list isn't chronological after
// reschedule" bug (2026-08-20): three places in this slice replaced a
// session in the store without re-sorting, so changing scheduled_at (the
// sort key) left the session at its old list position instead of moving it.

type SessionsState = {
  sessions: Session[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  scope: "none" | "all" | `client:${string}`;
};

const initialState: SessionsState = { sessions: [], status: "idle", error: null, scope: "none" };

const makeSession = (overrides: Partial<Session> & { id: string; scheduled_at: string }): Session => ({
  address: null,
  attended: null,
  client_id: "client-1",
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "admin-1",
  duration_minutes: 50,
  google_event_id: null,
  imported_from_stub_id: null,
  is_supervision: false,
  location: null,
  manual_payment_status: "none",
  metadata: null,
  notes: null,
  paid: false,
  paid_at: null,
  price_pence: 0,
  reference_code: null,
  send_reminders: true,
  status: "scheduled",
  stripe_payment_intent_id: null,
  supervision_cost_pence: null,
  ...overrides,
});

describe("sessionsSlice ordering", () => {
  it("upsertSession moves an existing session to its new chronological position on reschedule", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" }),
        makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z" }),
        makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z" }),
      ],
    };

    // Reschedule "c" (originally last) to before "a" (originally first).
    const rescheduledC = makeSession({
      id: "c",
      scheduled_at: "2026-05-01T09:00:00.000Z",
      status: "rescheduled",
    });

    const result = sessionsReducer(state, upsertSession(rescheduledC));

    expect(result.sessions.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("updateSession.fulfilled re-sorts after a reschedule", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" }),
        makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z" }),
      ],
    };

    const rescheduledA = makeSession({
      id: "a",
      scheduled_at: "2026-06-05T09:00:00.000Z",
      status: "rescheduled",
    });

    const result = sessionsReducer(
      state,
      updateSession.fulfilled(rescheduledA, "", { id: "a", scheduled_at: rescheduledA.scheduled_at }),
    );

    expect(result.sessions.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("fetchAllSessions.fulfilled sorts an out-of-order payload", () => {
    const payload = [
      makeSession({ id: "z", scheduled_at: "2026-06-03T09:00:00.000Z" }),
      makeSession({ id: "y", scheduled_at: "2026-06-01T09:00:00.000Z" }),
      makeSession({ id: "x", scheduled_at: "2026-06-02T09:00:00.000Z" }),
    ];

    const result = sessionsReducer(initialState, fetchAllSessions.fulfilled(payload, ""));

    expect(result.sessions.map((s) => s.id)).toEqual(["y", "x", "z"]);
  });

  it("fetchSessionsByClientId.fulfilled sorts an out-of-order payload", () => {
    const payload = [
      makeSession({ id: "z", scheduled_at: "2026-06-03T09:00:00.000Z" }),
      makeSession({ id: "y", scheduled_at: "2026-06-01T09:00:00.000Z" }),
    ];

    const result = sessionsReducer(initialState, fetchSessionsByClientId.fulfilled(payload, "", "client-1"));

    expect(result.sessions.map((s) => s.id)).toEqual(["y", "z"]);
  });

  // Regression coverage for "picking a client on the scheduler shows an empty
  // calendar until a hard refresh": state.sessions is shared, and both fetches
  // set status "succeeded", so consumers of the full list need `scope` to tell
  // a client-scoped load apart from a whole-practice one.
  it("fetchSessionsByClientId.fulfilled marks the store scope as client-scoped", () => {
    const result = sessionsReducer(
      initialState,
      fetchSessionsByClientId.fulfilled(
        [makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" })],
        "",
        "client-42",
      ),
    );
    expect(result.scope).toBe("client:client-42");
  });

  it("fetchAllSessions.fulfilled resets the store scope to 'all'", () => {
    const clientScoped = sessionsReducer(initialState, fetchSessionsByClientId.fulfilled([], "", "client-42"));
    expect(clientScoped.scope).toBe("client:client-42");

    const allLoaded = sessionsReducer(
      clientScoped,
      fetchAllSessions.fulfilled([makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" })], ""),
    );
    expect(allLoaded.scope).toBe("all");
  });

  it("createSession.fulfilled inserts the new session in chronological order, not just at the end", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" }),
        makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z" }),
      ],
    };

    const newSession = makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z" });
    const { id: _id, created_at: _createdAt, status: _status, ...createPayload } = newSession;

    const result = sessionsReducer(state, createSession.fulfilled(newSession, "", createPayload));

    expect(result.sessions.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

// Regression coverage for "marking one session in a block as paid doesn't
// mark the others" (2026-08-24): the DB's cascade_block_payment trigger
// updates every sibling server-side, but this reducer only ever patched the
// one session returned from the update call — the rest sat stale until a
// realtime event happened to land. updateSession.fulfilled now mirrors that
// cascade locally so the whole block reflects it immediately.
describe("sessionsSlice block payment cascade", () => {
  const blockMeta = (pos: number) => ({ block_id: "block-1", block_pos: pos, block_total: 3, block_start: "" });

  it("marks every other session in the same block as paid when one is confirmed paid", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta(1) }),
        makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z", metadata: blockMeta(2) }),
        makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z", metadata: blockMeta(3) }),
      ],
    };

    const paidB = makeSession({
      id: "b",
      scheduled_at: "2026-06-02T09:00:00.000Z",
      metadata: blockMeta(2),
      paid: true,
      paid_at: "2026-08-24T12:00:00.000Z",
    });

    const result = sessionsReducer(state, updateSession.fulfilled(paidB, "", { id: "b", paid: true }));

    expect(result.sessions.map((s) => [s.id, s.paid])).toEqual([
      ["a", true],
      ["b", true],
      ["c", true],
    ]);
  });

  it("marks every other session in the same block as unpaid when one is reverted", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta(1), paid: true }),
        makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z", metadata: blockMeta(2), paid: true }),
      ],
    };

    const unpaidA = makeSession({
      id: "a",
      scheduled_at: "2026-06-01T09:00:00.000Z",
      metadata: blockMeta(1),
      paid: false,
      paid_at: null,
    });

    const result = sessionsReducer(state, updateSession.fulfilled(unpaidA, "", { id: "a", paid: false }));

    expect(result.sessions.map((s) => [s.id, s.paid])).toEqual([
      ["a", false],
      ["b", false],
    ]);
  });

  it("does not touch a same-client session outside the block", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", metadata: blockMeta(1) }),
        makeSession({ id: "solo", scheduled_at: "2026-06-05T09:00:00.000Z", metadata: null }),
      ],
    };

    const paidA = makeSession({
      id: "a",
      scheduled_at: "2026-06-01T09:00:00.000Z",
      metadata: blockMeta(1),
      paid: true,
    });

    const result = sessionsReducer(state, updateSession.fulfilled(paidA, "", { id: "a", paid: true }));

    expect(result.sessions.find((s) => s.id === "solo")?.paid).toBe(false);
  });

  it("does not touch a different client's session sharing the same block_id", () => {
    const state: SessionsState = {
      ...initialState,
      sessions: [
        makeSession({
          id: "a",
          scheduled_at: "2026-06-01T09:00:00.000Z",
          metadata: blockMeta(1),
          client_id: "client-1",
        }),
        makeSession({
          id: "other-client",
          scheduled_at: "2026-06-01T09:00:00.000Z",
          metadata: blockMeta(1),
          client_id: "client-2",
        }),
      ],
    };

    const paidA = makeSession({
      id: "a",
      scheduled_at: "2026-06-01T09:00:00.000Z",
      metadata: blockMeta(1),
      client_id: "client-1",
      paid: true,
    });

    const result = sessionsReducer(state, updateSession.fulfilled(paidA, "", { id: "a", paid: true }));

    expect(result.sessions.find((s) => s.id === "other-client")?.paid).toBe(false);
  });
});
