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

// Revenue in pounds from PAID sessions, bucketed by calendar month.
export function revenueByMonth(sessions: Session[], months = 6): TrendPoint[] {
  const { points, index } = monthBuckets(months);
  for (const s of sessions) {
    if (!s.paid) continue;
    const idx = index.get(monthKey(new Date(s.scheduled_at)));
    if (idx === undefined) continue;
    points[idx].value += (s.price_pence ?? 0) / 100;
  }
  return points.map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 }));
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
