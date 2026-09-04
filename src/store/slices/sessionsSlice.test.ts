import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sessionsReducer, { deleteSession, updateSession } from "./sessionsSlice";

// updateSession is a *mutation* — clicking "mark attended", "mark paid", saving
// notes, or an in-place reschedule. It must NOT drive the page-level status
// guard (isPageStatusLoading): flipping `status` to "loading" here flashed the
// whole scheduler — and any open session modal — to a spinner on every click,
// which read as a full page reload. deleteSession already avoids this; these
// tests lock it in for updateSession and cover the fulfilled-reducer edges.

const { supabaseMock, singleSpy, updateSpy } = vi.hoisted(() => {
  const singleSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const updateSpy = vi.fn();
  const chain: Record<string, unknown> = {
    update: (...args: unknown[]) => {
      updateSpy(...args);
      return chain;
    },
    eq: () => chain,
    select: () => chain,
    single: singleSpy,
    delete: () => chain,
  };
  return { supabaseMock: { from: vi.fn(() => chain) }, singleSpy, updateSpy };
});
vi.mock("../../lib/supabase.js", () => ({ supabase: supabaseMock }));

type AnySession = Record<string, unknown>;

const session = (over: AnySession = {}): AnySession => ({
  id: "s1",
  client_id: "c1",
  created_by: "admin-1",
  created_at: "2026-09-01T00:00:00Z",
  scheduled_at: "2026-09-10T10:00:00Z",
  duration_minutes: 50,
  status: "scheduled",
  attended: null,
  paid: false,
  paid_at: null,
  manual_payment_status: "none",
  notes: null,
  reference_code: null,
  metadata: null,
  ...over,
});

function makeStore(sessions: AnySession[], status: "idle" | "loading" | "succeeded" | "failed" = "succeeded") {
  return configureStore({
    reducer: { sessions: sessionsReducer },
    preloadedState: {
      // biome-ignore lint/suspicious/noExplicitAny: minimal preloaded slice for the test
      sessions: { sessions: sessions as any, status, error: null, scope: "all" as const },
    },
  });
}

const getSessions = (store: ReturnType<typeof makeStore>) => store.getState().sessions.sessions;

beforeEach(() => {
  singleSpy.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.clearAllMocks());

describe("updateSession — does not touch page status (the reload-flash fix)", () => {
  it("pending: leaves status alone instead of flipping it to 'loading'", () => {
    const base = { sessions: [session()], status: "succeeded" as const, error: null, scope: "all" as const };
    // biome-ignore lint/suspicious/noExplicitAny: exercising the raw reducer with the thunk's pending action
    const next = sessionsReducer(base as any, updateSession.pending("req-1", { id: "s1", attended: true }));
    expect(next.status).toBe("succeeded");
  });

  it("fulfilled: applies the change without touching status", async () => {
    const store = makeStore([session({ attended: null })]);
    singleSpy.mockResolvedValueOnce({ data: session({ attended: true }), error: null });

    await store.dispatch(updateSession({ id: "s1", attended: true }));

    expect(getSessions(store)[0].attended).toBe(true);
    expect(store.getState().sessions.status).toBe("succeeded");
    expect(store.getState().sessions.error).toBeNull();
  });

  it("rejected: records the error but does not flip status to 'failed'", async () => {
    const store = makeStore([session({ attended: null })]);
    singleSpy.mockResolvedValueOnce({ data: null, error: { message: "row-level security violation" } });

    const result = await store.dispatch(updateSession({ id: "s1", attended: true }));

    expect(updateSession.rejected.match(result)).toBe(true);
    expect(store.getState().sessions.error).toMatch(/row-level security/);
    expect(store.getState().sessions.status).toBe("succeeded");
    // the optimistic-free reducer left the row untouched
    expect(getSessions(store)[0].attended).toBeNull();
  });

  it("mirrors deleteSession, which also leaves status untouched", () => {
    const base = { sessions: [session()], status: "succeeded" as const, error: null, scope: "all" as const };
    // biome-ignore lint/suspicious/noExplicitAny: raw reducer + thunk action
    const next = sessionsReducer(base as any, deleteSession.fulfilled("s1", "req-1", "s1"));
    expect(next.sessions).toHaveLength(0);
    expect(next.status).toBe("succeeded");
  });
});

describe("updateSession.fulfilled — reducer edges", () => {
  it("re-sorts by scheduled_at when a reschedule moves a session later", async () => {
    const store = makeStore([
      session({ id: "s1", scheduled_at: "2026-09-10T09:00:00Z" }),
      session({ id: "s2", scheduled_at: "2026-09-10T11:00:00Z" }),
    ]);
    singleSpy.mockResolvedValueOnce({
      data: session({ id: "s1", scheduled_at: "2026-09-10T13:00:00Z" }),
      error: null,
    });

    await store.dispatch(updateSession({ id: "s1", scheduled_at: "2026-09-10T13:00:00Z" }));

    expect(getSessions(store).map((s: AnySession) => s.id)).toEqual(["s2", "s1"]);
  });

  it("ignores a fulfilled update for a session that isn't in local state", async () => {
    const store = makeStore([session({ id: "s1" })]);
    singleSpy.mockResolvedValueOnce({ data: session({ id: "ghost", notes: "hi" }), error: null });

    await store.dispatch(updateSession({ id: "ghost", notes: "hi" }));

    // no upsert — realtime / a refetch is what brings in rows this client
    // doesn't already hold; the mutation reducer only patches what's there
    expect(getSessions(store)).toHaveLength(1);
    expect(getSessions(store)[0].id).toBe("s1");
  });

  it("writes a cleared value through (attended true → null)", async () => {
    const store = makeStore([session({ attended: true })]);
    singleSpy.mockResolvedValueOnce({ data: session({ attended: null }), error: null });

    await store.dispatch(updateSession({ id: "s1", attended: null }));

    expect(getSessions(store)[0].attended).toBeNull();
  });

  it("sends only the changed fields to supabase.update (id is stripped)", async () => {
    const store = makeStore([session()]);
    singleSpy.mockResolvedValueOnce({ data: session({ paid: true }), error: null });

    await store.dispatch(updateSession({ id: "s1", paid: true }));

    expect(updateSpy).toHaveBeenCalledWith({ paid: true });
  });
});

describe("updateSession.fulfilled — block payment cascade", () => {
  const block = (id: string, over: AnySession = {}) =>
    session({ id, client_id: "c1", metadata: { block_id: "blk" }, ...over });

  it("propagates paid + approves pending siblings in the same block", async () => {
    const store = makeStore([
      block("s1", { paid: false, manual_payment_status: "pending" }),
      block("s2", { paid: false, manual_payment_status: "pending" }),
      block("s3", { paid: false, manual_payment_status: "pending" }),
      session({ id: "other", client_id: "c1", metadata: null, paid: false }),
    ]);
    singleSpy.mockResolvedValueOnce({
      data: block("s1", { paid: true, paid_at: "2026-09-11T00:00:00Z", manual_payment_status: "approved" }),
      error: null,
    });

    await store.dispatch(updateSession({ id: "s1", paid: true }));

    const byId = Object.fromEntries(getSessions(store).map((s: AnySession) => [s.id, s]));
    expect(byId.s2.paid).toBe(true);
    expect(byId.s2.paid_at).toBe("2026-09-11T00:00:00Z");
    expect(byId.s2.manual_payment_status).toBe("approved");
    expect(byId.s3.paid).toBe(true);
    // a non-block session for the same client is left alone
    expect(byId.other.paid).toBe(false);
  });

  it("propagates un-paid and drops approved siblings back to 'none'", async () => {
    const store = makeStore([
      block("s1", { paid: true, manual_payment_status: "approved" }),
      block("s2", { paid: true, manual_payment_status: "approved" }),
    ]);
    singleSpy.mockResolvedValueOnce({
      data: block("s1", { paid: false, paid_at: null, manual_payment_status: "none" }),
      error: null,
    });

    await store.dispatch(updateSession({ id: "s1", paid: false }));

    const s2 = getSessions(store).find((s: AnySession) => s.id === "s2");
    expect(s2?.paid).toBe(false);
    expect(s2?.paid_at).toBeNull();
    expect(s2?.manual_payment_status).toBe("none");
  });

  it("does not cascade when the updated session has no block_id", async () => {
    const store = makeStore([
      session({ id: "s1", metadata: null, paid: false }),
      session({ id: "s2", client_id: "c1", metadata: null, paid: false }),
    ]);
    singleSpy.mockResolvedValueOnce({ data: session({ id: "s1", metadata: null, paid: true }), error: null });

    await store.dispatch(updateSession({ id: "s1", paid: true }));

    expect(getSessions(store).find((s: AnySession) => s.id === "s2")?.paid).toBe(false);
  });
});
