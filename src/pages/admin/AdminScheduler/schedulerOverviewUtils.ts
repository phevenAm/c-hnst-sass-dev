import type { Session, StubSession } from "@/models/globalTypes";

// Minimal session shape the overview reducers read — lets real `sessions` rows
// and normalised stub sessions share one code path.
export type OverviewSession = Pick<
  Session,
  "scheduled_at" | "duration_minutes" | "location" | "price_pence" | "paid" | "attended" | "status"
>;

// Which slice of the session list to show below the calendar.
export type ListScope = "upcoming" | "past" | "all";

// Offline-client (stub) sessions track attendance via `status` rather than an
// `attended` boolean, and only ever have scheduled / attended / no_show /
// cancelled — no "completed" or "rescheduled". Map them onto the same shape a
// real session has so the overview donuts + totals can count both.
export function normalizeStubSession(s: StubSession): OverviewSession {
  let attended: boolean | null = null;
  if (s.status === "attended") attended = true;
  else if (s.status === "no_show") attended = false;

  let status: Session["status"] = "scheduled";
  if (s.status === "attended") status = "completed";
  else if (s.status === "cancelled") status = "cancelled";

  return {
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes ?? 0,
    location: s.location,
    price_pence: s.price_pence ?? 0,
    paid: s.paid,
    attended,
    status,
  };
}

// Real sessions + normalised stub sessions, ready for the overview reducers.
export function toOverviewSessions(real: Session[], stubs: StubSession[]): OverviewSession[] {
  return [...real, ...stubs.map(normalizeStubSession)];
}

// Filter a list to the chosen scope and sort it: past = most recent first,
// upcoming / all = soonest first. `now` is injectable for tests.
export function filterAndSortByScope<T extends { scheduled_at: string }>(
  items: T[],
  scope: ListScope,
  now: number = Date.now(),
): T[] {
  const inScope = (iso: string) => {
    if (scope === "all") return true;
    const isPast = new Date(iso).getTime() <= now;
    return scope === "past" ? isPast : !isPast;
  };
  const byDate = (a: T, b: T) => {
    const diff = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    return scope === "past" ? -diff : diff;
  };
  return items.filter((s) => inScope(s.scheduled_at)).sort(byDate);
}

export interface OverviewStats {
  total: number;
  attended: number;
  skipped: number;
  cancelled: number;
  upcoming: number;
  paidCount: number;
  revenuePence: number;
  outstandingPence: number;
  statusScheduled: number;
  statusCompleted: number;
  statusRescheduled: number;
}

// Aggregate counts + payment totals in a single pass. Semantics match the
// SessionCard: no-show is strictly attended === false (null = unmarked, not
// counted as skipped); revenue / outstanding split on the `paid` flag.
export function computeOverviewStats(sessions: OverviewSession[], now: number = Date.now()): OverviewStats {
  return sessions.reduce<OverviewStats>(
    (acc, s) => {
      acc.total += 1;
      if (s.attended === true) acc.attended += 1;
      if (s.attended === false) acc.skipped += 1;
      if (s.status === "cancelled") acc.cancelled += 1;
      if (s.status === "completed") acc.statusCompleted += 1;
      if (s.status === "rescheduled") acc.statusRescheduled += 1;
      if (s.status === "scheduled") acc.statusScheduled += 1;
      if (s.status === "scheduled" && new Date(s.scheduled_at).getTime() > now) acc.upcoming += 1;
      if (s.paid) {
        acc.paidCount += 1;
        acc.revenuePence += s.price_pence ?? 0;
      } else {
        acc.outstandingPence += s.price_pence ?? 0;
      }
      return acc;
    },
    {
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
    },
  );
}
