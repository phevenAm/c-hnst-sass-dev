import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { Session } from "@/models/globalTypes";
import {
  mergeTrendPoints,
  revenueByMonth,
  revenueByMonthFromPayments,
  revenueByMonthFromStubSessions,
} from "./dashboardUtils";

// Bucketing is relative to "now" (monthBuckets walks back from the current
// month), so every test builds dates relative to dayjs() rather than
// hardcoding calendar months — otherwise these would start failing the
// month this test suite turns a year old.
const thisMonthIso = (day = 15) => dayjs().date(day).toISOString();
const monthsAgoIso = (n: number, day = 15) => dayjs().subtract(n, "month").date(day).toISOString();

function session(overrides: Partial<Session>): Session {
  return {
    id: "s1",
    client_id: "c1",
    created_by: "a1",
    scheduled_at: thisMonthIso(),
    price_pence: 5000,
    paid: true,
    status: "scheduled",
    duration_minutes: 50,
    metadata: null,
    ...overrides,
  } as Session;
}

describe("revenueByMonth", () => {
  it("counts a paid session in its month, converting pence to pounds", () => {
    const points = revenueByMonth([session({ price_pence: 5000, paid: true })], 6);
    expect(points.at(-1)!.value).toBe(50);
  });

  it("excludes unpaid sessions", () => {
    const points = revenueByMonth([session({ price_pence: 5000, paid: false })], 6);
    expect(points.at(-1)!.value).toBe(0);
  });

  it("excludes sessions older than the requested window", () => {
    const points = revenueByMonth([session({ scheduled_at: monthsAgoIso(6), price_pence: 5000, paid: true })], 6);
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(0);
  });

  it("places a session from N months ago in the correct bucket", () => {
    const points = revenueByMonth([session({ scheduled_at: monthsAgoIso(2), price_pence: 10000, paid: true })], 6);
    expect(points[points.length - 1 - 2].value).toBe(100);
    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(100);
  });

  it("sums multiple paid sessions in the same month", () => {
    const points = revenueByMonth(
      [session({ price_pence: 5000, paid: true }), session({ price_pence: 2500, paid: true })],
      6,
    );
    expect(points.at(-1)!.value).toBe(75);
  });
});

function stubSession(overrides: {
  scheduled_at?: string;
  amount_paid?: number | null;
  paid?: boolean;
  price_pence?: number | null;
}) {
  return {
    scheduled_at: thisMonthIso(),
    amount_paid: null,
    paid: false,
    price_pence: null,
    ...overrides,
  };
}

describe("revenueByMonthFromStubSessions", () => {
  it("counts a paid stub session, treating amount_paid as pounds", () => {
    const points = revenueByMonthFromStubSessions([stubSession({ amount_paid: 42.5 })], 6);
    expect(points.at(-1)!.value).toBe(42.5);
  });

  it("excludes stub sessions with no amount recorded and paid still false", () => {
    const points = revenueByMonthFromStubSessions([stubSession({ amount_paid: null })], 6);
    expect(points.at(-1)!.value).toBe(0);
  });

  it("excludes stub sessions with a zero amount and paid still false", () => {
    const points = revenueByMonthFromStubSessions([stubSession({ amount_paid: 0 })], 6);
    expect(points.at(-1)!.value).toBe(0);
  });

  // Regression: creating a session already marked paid sets `paid: true` but
  // never touches amount_paid — that used to make it vanish from revenue
  // entirely despite showing as paid on the client's own detail page.
  it("counts a session marked paid at creation, falling back to price_pence with no amount_paid set", () => {
    const points = revenueByMonthFromStubSessions([stubSession({ paid: true, price_pence: 8500 })], 6);
    expect(points.at(-1)!.value).toBe(85);
  });

  it("prefers amount_paid over price_pence when both are set", () => {
    const points = revenueByMonthFromStubSessions([stubSession({ paid: true, price_pence: 8500, amount_paid: 70 })], 6);
    expect(points.at(-1)!.value).toBe(70);
  });
});

describe("revenueByMonthFromPayments", () => {
  it("counts every manual payment — a row only exists once money is received", () => {
    const points = revenueByMonthFromPayments([{ paid_at: thisMonthIso(), amount_pence: 3000 }], 6);
    expect(points.at(-1)!.value).toBe(30);
  });

  it("buckets by paid_at, not any session date", () => {
    const points = revenueByMonthFromPayments([{ paid_at: monthsAgoIso(1), amount_pence: 1000 }], 6);
    expect(points[points.length - 1 - 1].value).toBe(10);
    expect(points.at(-1)!.value).toBe(0);
  });
});

describe("mergeTrendPoints", () => {
  it("sums series index-wise", () => {
    const a = [
      { label: "Jan", value: 10 },
      { label: "Feb", value: 20 },
    ];
    const b = [
      { label: "Jan", value: 5 },
      { label: "Feb", value: 0 },
    ];
    const c = [
      { label: "Jan", value: 1.5 },
      { label: "Feb", value: 2.5 },
    ];
    expect(mergeTrendPoints(a, b, c)).toEqual([
      { label: "Jan", value: 16.5 },
      { label: "Feb", value: 22.5 },
    ]);
  });

  it("returns the first series unchanged when it's the only one", () => {
    const a = [{ label: "Jan", value: 10 }];
    expect(mergeTrendPoints(a)).toEqual(a);
  });

  it("matches what AdminPaymentsPage/AdminDashboard actually combine — sessions + stub sessions + manual payments", () => {
    const sessions = revenueByMonth([session({ price_pence: 5000, paid: true })], 3);
    const stubs = revenueByMonthFromStubSessions([stubSession({ amount_paid: 10 })], 3);
    const manual = revenueByMonthFromPayments([{ paid_at: thisMonthIso(), amount_pence: 1500 }], 3);
    const merged = mergeTrendPoints(sessions, stubs, manual);
    expect(merged.at(-1)!.value).toBe(50 + 10 + 15);
  });
});
