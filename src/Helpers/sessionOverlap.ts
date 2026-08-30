// Shared double-booking rule for the scheduler.
//
// Mirrors the DB predicate `public.practice_slot_has_conflict`
// (supabase/migrations/20260830000000_double_booking_across_offline_clients.sql)
// so the client-side "this slot is taken" check and the server-side trigger
// agree. The DB trigger is the actual guarantee; this is for instant feedback
// where both session lists are already in memory (e.g. the scheduler drag).
//
// A slot conflicts with:
//   - any real session whose status is not "cancelled"
//   - any offline-client (stub) session whose status is "scheduled"
//     (back-dated "attended" / "no_show" history logs never conflict)
// Overlap is half-open: back-to-back sessions (one ends exactly as the next
// starts) do NOT conflict. Missing duration is treated as 50 minutes.

const DEFAULT_DURATION_MIN = 50;

type MinSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
};

type MinStubSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
};

export type SlotConflict = { kind: "real" | "stub"; id: string };

export type FindSlotConflictOptions = {
  /** Proposed session start. */
  start: Date | string;
  /** Proposed session length in minutes. */
  durationMinutes: number;
  /** Real sessions to check against (the practice's own rows). */
  sessions?: MinSession[];
  /** Offline-client (stub) sessions to check against. */
  stubSessions?: MinStubSession[];
  /** Real session being rescheduled — never conflicts with itself. */
  excludeSessionId?: string | null;
  /** Stub session being rescheduled — never conflicts with itself. */
  excludeStubSessionId?: string | null;
};

const startMs = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart;

// Returns the first booking the proposed slot collides with, or null when the
// slot is free.
export function findSlotConflict(opts: FindSlotConflictOptions): SlotConflict | null {
  const propStart = startMs(opts.start);
  if (Number.isNaN(propStart)) return null;
  const propEnd = propStart + (opts.durationMinutes || DEFAULT_DURATION_MIN) * 60_000;

  for (const s of opts.sessions ?? []) {
    if (s.status === "cancelled") continue;
    if (opts.excludeSessionId && s.id === opts.excludeSessionId) continue;
    const sStart = startMs(s.scheduled_at);
    if (Number.isNaN(sStart)) continue;
    const sEnd = sStart + (s.duration_minutes ?? DEFAULT_DURATION_MIN) * 60_000;
    if (overlaps(propStart, propEnd, sStart, sEnd)) return { kind: "real", id: s.id };
  }

  for (const s of opts.stubSessions ?? []) {
    if (s.status !== "scheduled") continue;
    if (opts.excludeStubSessionId && s.id === opts.excludeStubSessionId) continue;
    const sStart = startMs(s.scheduled_at);
    if (Number.isNaN(sStart)) continue;
    const sEnd = sStart + (s.duration_minutes ?? DEFAULT_DURATION_MIN) * 60_000;
    if (overlaps(propStart, propEnd, sStart, sEnd)) return { kind: "stub", id: s.id };
  }

  return null;
}

export const hasSlotConflict = (opts: FindSlotConflictOptions): boolean => findSlotConflict(opts) !== null;
