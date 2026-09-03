import { describe, expect, it } from "vitest";

import type { Session, StubSession } from "@/models/globalTypes";
import {
  computeOverviewStats,
  filterAndSortByScope,
  normalizeStubSession,
  type OverviewSession,
  toOverviewSessions,
} from "./schedulerOverviewUtils";

// A fixed "now" so scope / upcoming assertions don't depend on the wall clock.
const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();

const session = (over: Partial<Session> = {}): Session =>
  ({
    id: `s-${Math.random()}`,
    client_id: "c-1",
    scheduled_at: iso(1),
    duration_minutes: 50,
    location: null,
    price_pence: 6000,
    paid: false,
    attended: null,
    status: "scheduled",
    ...over,
  }) as unknown as Session;

const stub = (over: Partial<StubSession> = {}): StubSession =>
  ({
    id: `st-${Math.random()}`,
    stub_id: "stub-1",
    admin_id: "a-1",
    scheduled_at: iso(1),
    duration_minutes: 50,
    status: "scheduled",
    price_pence: 5000,
    paid: false,
    amount_paid: null,
    currency: "gbp",
    notes: null,
    code: null,
    location: null,
    created_at: iso(-10),
    metadata: null,
    ...over,
  }) as StubSession;

const overview = (over: Partial<OverviewSession> = {}): OverviewSession => ({
  scheduled_at: iso(1),
  duration_minutes: 50,
  location: null,
  price_pence: 6000,
  paid: false,
  attended: null,
  status: "scheduled",
  ...over,
});

describe("normalizeStubSession", () => {
  it("maps an attended stub session to attended=true / status=completed", () => {
    const out = normalizeStubSession(stub({ status: "attended" }));
    expect(out.attended).toBe(true);
    expect(out.status).toBe("completed");
  });

  it("maps a no_show stub session to attended=false / status=scheduled", () => {
    const out = normalizeStubSession(stub({ status: "no_show" }));
    expect(out.attended).toBe(false);
    expect(out.status).toBe("scheduled");
  });

  it("maps a cancelled stub session to attended=null / status=cancelled", () => {
    const out = normalizeStubSession(stub({ status: "cancelled" }));
    expect(out.attended).toBeNull();
    expect(out.status).toBe("cancelled");
  });

  it("leaves a plain scheduled stub session unmarked", () => {
    const out = normalizeStubSession(stub({ status: "scheduled" }));
    expect(out.attended).toBeNull();
    expect(out.status).toBe("scheduled");
  });

  it("coerces null duration_minutes and price_pence to 0", () => {
    const out = normalizeStubSession(stub({ duration_minutes: null, price_pence: null }));
    expect(out.duration_minutes).toBe(0);
    expect(out.price_pence).toBe(0);
  });

  it("carries scheduled_at, location and paid through unchanged", () => {
    const out = normalizeStubSession(stub({ scheduled_at: iso(3), location: "in_person", paid: true }));
    expect(out).toMatchObject({ scheduled_at: iso(3), location: "in_person", paid: true });
  });
});

describe("toOverviewSessions", () => {
  it("concatenates real sessions with normalised stub sessions", () => {
    const out = toOverviewSessions([session(), session()], [stub({ status: "attended" })]);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ status: "completed", attended: true });
  });

  it("returns an empty array when there is nothing on either side", () => {
    expect(toOverviewSessions([], [])).toEqual([]);
  });

  it("passes real sessions through untouched", () => {
    const s = session({ status: "rescheduled", attended: false });
    expect(toOverviewSessions([s], [])[0]).toBe(s);
  });
});

describe("filterAndSortByScope", () => {
  const past2 = session({ scheduled_at: iso(-2) });
  const past1 = session({ scheduled_at: iso(-1) });
  const future1 = session({ scheduled_at: iso(1) });
  const future2 = session({ scheduled_at: iso(2) });
  const all = [future1, past2, future2, past1];

  it("past: keeps only past sessions, most recent first", () => {
    expect(filterAndSortByScope(all, "past", NOW)).toEqual([past1, past2]);
  });

  it("upcoming: keeps only future sessions, soonest first", () => {
    expect(filterAndSortByScope(all, "upcoming", NOW)).toEqual([future1, future2]);
  });

  it("all: keeps everything, most recent first", () => {
    expect(filterAndSortByScope(all, "all", NOW)).toEqual([future2, future1, past1, past2]);
  });

  it("treats a session exactly at now as past", () => {
    const atNow = session({ scheduled_at: new Date(NOW).toISOString() });
    expect(filterAndSortByScope([atNow], "past", NOW)).toEqual([atNow]);
    expect(filterAndSortByScope([atNow], "upcoming", NOW)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(filterAndSortByScope([], "all", NOW)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [future1, past1];
    const snapshot = [...input];
    filterAndSortByScope(input, "past", NOW);
    expect(input).toEqual(snapshot);
  });
});

describe("computeOverviewStats", () => {
  it("aggregates counts, attendance and payment totals across a mixed set", () => {
    const sessions = [
      overview({ status: "completed", attended: true, paid: true, price_pence: 6000 }),
      overview({ status: "completed", attended: false, paid: false, price_pence: 6000 }),
      overview({ status: "cancelled", paid: false, price_pence: 4000 }),
      overview({ status: "rescheduled", paid: false, price_pence: 5000 }),
      overview({ status: "scheduled", scheduled_at: iso(3), paid: true, price_pence: 7000 }),
      overview({ status: "scheduled", scheduled_at: iso(-3), paid: false, price_pence: 7000 }),
    ];

    const stats = computeOverviewStats(sessions, NOW);

    expect(stats).toEqual({
      total: 6,
      attended: 1,
      skipped: 1,
      cancelled: 1,
      upcoming: 1, // only the future-dated scheduled one
      paidCount: 2,
      revenuePence: 13000, // 6000 + 7000
      outstandingPence: 22000, // 6000 + 4000 + 5000 + 7000
      statusScheduled: 2,
      statusCompleted: 2,
      statusRescheduled: 1,
    });
  });

  it("returns all-zero stats for an empty list", () => {
    expect(computeOverviewStats([], NOW)).toEqual({
      total: 0,
      attended: 0,
      skipped: 0,
      cancelled: 0,
      upcoming: 0,
      paidCount: 0,
      revenuePence: 0,
      outstandingPence: 0,
      statusScheduled: 0,
      statusCompleted: 0,
      statusRescheduled: 0,
    });
  });

  it("does not count a null-attended session as attended or skipped", () => {
    const stats = computeOverviewStats([overview({ attended: null })], NOW);
    expect(stats.attended).toBe(0);
    expect(stats.skipped).toBe(0);
  });
});
