import type { Session } from "@/models/globalTypes";

export type TrendPoint = { label: string; value: number };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

// Builds `months` empty monthly buckets ending on the current month, plus a
// key→index lookup so callers can bucket rows in one pass. Oldest → newest.
const monthBuckets = (months: number) => {
  const now = new Date();
  const points: TrendPoint[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    index.set(monthKey(d), points.length);
    points.push({ label: MONTH_LABELS[d.getMonth()], value: 0 });
  }
  return { points, index };
};

// Monday-anchored start of the week containing `date` (time zeroed).
const startOfWeek = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (d.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  d.setDate(d.getDate() - mondayOffset);
  return d;
};

/** A row that counted towards revenue: when, and how much (in pence). */
export type PaidRow = { date: string; pence: number };

// Revenue in pounds from PAID sessions, bucketed by calendar month.
export function revenueByMonth(sessions: Session[], months = 6): TrendPoint[] {
  return bucketPaidRowsByMonth(paidSessionRows(sessions), months);
}

// Revenue from paid offline (stub) sessions — same shape, different table.
export function revenueByMonthFromStubSessions(
  stubSessions: { scheduled_at: string; amount_paid: number | null; paid: boolean; price_pence: number | null }[],
  months = 6,
): TrendPoint[] {
  return bucketPaidRowsByMonth(paidStubSessionRows(stubSessions), months);
}

// Revenue from manually-recorded payments (cash, bank transfer, etc.).
export function revenueByMonthFromPayments(
  payments: { paid_at: string; amount_pence: number }[],
  months = 6,
): TrendPoint[] {
  return bucketPaidRowsByMonth(paidPaymentRows(payments), months);
}

// Paid sessions as flat {date, pence} rows — the building block both the
// fixed "last N months" exports above and AdminDashboard's flexible-range
// trend chart (bucketTrend/bucketSeries in financeOverview.ts) bucket from.
export function paidSessionRows(sessions: Session[]): PaidRow[] {
  return sessions.filter((s) => s.paid).map((s) => ({ date: s.scheduled_at, pence: s.price_pence ?? 0 }));
}

// stub_sessions carries two separate "is this paid" signals that can each be
// set independently: `paid` (a plain boolean, set at creation time or via
// StubSessionCard's Mark as paid/unpaid toggle) and `amount_paid` (a specific
// amount recorded via the Payments page's own "Mark paid" flow, which can
// differ from the session's listed price — e.g. a discount or partial
// payment). Either one alone means the session is paid; amount_paid is the
// more specific figure when both are set, since it's what was actually
// entered as received, falling back to the listed price_pence when only the
// plain boolean was flipped on.
export function paidStubSessionRows(
  stubSessions: { scheduled_at: string; amount_paid: number | null; paid: boolean; price_pence: number | null }[],
): PaidRow[] {
  return stubSessions
    .map((s) => {
      const hasAmountPaid = s.amount_paid != null && s.amount_paid > 0;
      let pence = 0;
      if (hasAmountPaid) pence = Math.round((s.amount_paid as number) * 100);
      else if (s.paid) pence = s.price_pence ?? 0;
      return { date: s.scheduled_at, pence, isPaid: s.paid || hasAmountPaid };
    })
    .filter((r) => r.isPaid)
    .map(({ date, pence }) => ({ date, pence }));
}

// A row in `payments` only ever exists once money has actually been
// received, so every row counts — no paid/unpaid filtering needed.
export function paidPaymentRows(payments: { paid_at: string; amount_pence: number }[]): PaidRow[] {
  return payments.map((p) => ({ date: p.paid_at, pence: p.amount_pence }));
}

function bucketPaidRowsByMonth(rows: PaidRow[], months: number): TrendPoint[] {
  const { points, index } = monthBuckets(months);
  for (const { date, pence } of rows) {
    const idx = index.get(monthKey(new Date(date)));
    if (idx === undefined) continue;
    points[idx].value += pence / 100;
  }
  return points.map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 }));
}

// Sums same-length TrendPoint series index-wise (all bucketed with the same
// `months`, so their labels already line up).
export function mergeTrendPoints(...series: TrendPoint[][]): TrendPoint[] {
  const [first, ...rest] = series;
  const merged = first.map((p) => ({ ...p }));
  for (const s of rest) {
    s.forEach((p, i) => {
      merged[i].value = Math.round((merged[i].value + p.value) * 100) / 100;
    });
  }
  return merged;
}

// Count of non-cancelled sessions per week for the last `weeks` weeks.
export function sessionsByWeek(sessions: Session[], weeks = 8): TrendPoint[] {
  const thisWeek = startOfWeek(new Date());
  const points: TrendPoint[] = [];
  const index = new Map<number, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - i * 7);
    index.set(d.getTime(), points.length);
    points.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: 0 });
  }
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    const idx = index.get(startOfWeek(new Date(s.scheduled_at)).getTime());
    if (idx === undefined) continue;
    points[idx].value += 1;
  }
  return points;
}
