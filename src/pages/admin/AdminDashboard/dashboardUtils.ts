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

// Shared bucketing for anything shaped as "an amount, on a date, that may or
// may not count as collected yet" — sessions, stub sessions, and manual
// payments each have a different shape, so callers extract the three fields
// this needs via `pick` rather than this function knowing about any of them.
function revenueByMonthGeneric<T>(
  rows: T[],
  pick: (row: T) => { dateIso: string; amountPence: number; isPaid: boolean },
  months: number,
): TrendPoint[] {
  const { points, index } = monthBuckets(months);
  for (const row of rows) {
    const { dateIso, amountPence, isPaid } = pick(row);
    if (!isPaid) continue;
    const idx = index.get(monthKey(new Date(dateIso)));
    if (idx === undefined) continue;
    points[idx].value += amountPence / 100;
  }
  return points.map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 }));
}

// Revenue in pounds from PAID sessions, bucketed by calendar month.
export function revenueByMonth(sessions: Session[], months = 6): TrendPoint[] {
  return revenueByMonthGeneric(
    sessions,
    (s) => ({ dateIso: s.scheduled_at, amountPence: s.price_pence ?? 0, isPaid: !!s.paid }),
    months,
  );
}

// Revenue from paid offline (stub) sessions — same shape, different table.
//
// stub_sessions carries two separate "is this paid" signals that can each be
// set independently: `paid` (a plain boolean, set at creation time or via
// StubSessionCard's Mark as paid/unpaid toggle) and `amount_paid` (a specific
// amount recorded via the Payments page's own "Mark paid" flow, which can
// differ from the session's listed price — e.g. a discount or partial
// payment). Either one alone means the session is paid; amount_paid is the
// more specific figure when both are set, since it's what was actually
// entered as received, falling back to the listed price_pence when only the
// plain boolean was flipped on.
export function revenueByMonthFromStubSessions(
  stubSessions: { scheduled_at: string; amount_paid: number | null; paid: boolean; price_pence: number | null }[],
  months = 6,
): TrendPoint[] {
  return revenueByMonthGeneric(
    stubSessions,
    (s) => {
      const hasAmountPaid = s.amount_paid != null && s.amount_paid > 0;
      let amountPence = 0;
      if (hasAmountPaid) amountPence = Math.round((s.amount_paid as number) * 100);
      else if (s.paid) amountPence = s.price_pence ?? 0;
      return { dateIso: s.scheduled_at, amountPence, isPaid: s.paid || hasAmountPaid };
    },
    months,
  );
}

// Revenue from manually-recorded payments (cash, bank transfer, etc. logged
// via "Add payment") — a row in `payments` only ever exists once money has
// actually been received, so every row counts.
export function revenueByMonthFromPayments(
  payments: { paid_at: string; amount_pence: number }[],
  months = 6,
): TrendPoint[] {
  return revenueByMonthGeneric(
    payments,
    (p) => ({ dateIso: p.paid_at, amountPence: p.amount_pence, isPaid: true }),
    months,
  );
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
