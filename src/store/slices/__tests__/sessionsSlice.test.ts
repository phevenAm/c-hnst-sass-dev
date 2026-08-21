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
};

const initialState: SessionsState = { sessions: [], status: "idle", error: null };

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
