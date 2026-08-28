// Pure decision logic for client-facing session reminders, kept free of Deno
// and network APIs so it can be unit-tested with the project's Vitest runner
// (see reminderLogic.test.ts). The send-session-reminders edge function wires
// these to real data.

export const REMINDER_TYPE = "session_reminder";

// The function is invoked by a once-daily cron. DEFAULT_HOURS_BEFORE is how far
// ahead of a session we aim to remind (practices can override via
// practice_settings.reminder_hours_before); WINDOW_HALF_HOURS is the tolerance
// either side so a daily run still catches sessions that don't land exactly on
// the target hour.
export const DEFAULT_HOURS_BEFORE = 120; // 5 days
export const WINDOW_HALF_HOURS = 12;

const MS_PER_HOUR = 3_600_000;

export interface RemindableSession {
  id: string;
  scheduled_at: string;
  client_id: string;
}

export interface PracticeReminderConfig {
  /** practice_settings.reminder_hours_before */
  hoursBefore?: number | null;
  /** practice_settings.disabled_email_types — reminders are skipped if it contains REMINDER_TYPE */
  disabledTypes?: string[] | null;
}

/**
 * True when `scheduledAt` sits within +/- windowHalfHours of the point that is
 * `hoursBefore` hours from `now`. Invalid dates are never in the window.
 */
export function isWithinReminderWindow(
  scheduledAt: string,
  now: number,
  hoursBefore: number,
  windowHalfHours: number = WINDOW_HALF_HOURS,
): boolean {
  const sessionMs = new Date(scheduledAt).getTime();
  if (Number.isNaN(sessionMs)) return false;
  const targetMs = now + hoursBefore * MS_PER_HOUR;
  return Math.abs(sessionMs - targetMs) / MS_PER_HOUR <= windowHalfHours;
}

export interface SelectRemindersArgs<S extends RemindableSession> {
  sessions: S[];
  now: number;
  /** clientId -> owning practice admin_id (undefined drops the session) */
  adminIdForClient: (clientId: string) => string | undefined;
  /** admin_id -> that practice's reminder config (undefined = all defaults) */
  configForAdmin: (adminId: string) => PracticeReminderConfig | undefined;
  /** session ids that already have a 'sent' session_reminder in email_logs */
  alreadyRemindedSessionIds?: Iterable<string>;
  /** session ids to skip for other reasons this run (e.g. just auto-cancelled) */
  excludeSessionIds?: Iterable<string>;
  defaultHoursBefore?: number;
  windowHalfHours?: number;
}

/**
 * Filters `sessions` down to the ones that should get a reminder email on this
 * run: within the practice's reminder window, mapped to a known practice,
 * reminders not disabled for that practice, and not already reminded / excluded.
 * Order-preserving; never returns the same session twice.
 */
export function selectSessionsToRemind<S extends RemindableSession>(args: SelectRemindersArgs<S>): S[] {
  const already = new Set(args.alreadyRemindedSessionIds ?? []);
  const excluded = new Set(args.excludeSessionIds ?? []);
  const defaultHoursBefore = args.defaultHoursBefore ?? DEFAULT_HOURS_BEFORE;
  const seen = new Set<string>();

  return args.sessions.filter((session) => {
    if (seen.has(session.id)) return false;
    if (already.has(session.id) || excluded.has(session.id)) return false;

    const adminId = args.adminIdForClient(session.client_id);
    if (!adminId) return false;

    const config = args.configForAdmin(adminId);
    if (config?.disabledTypes?.includes(REMINDER_TYPE)) return false;

    const hoursBefore = config?.hoursBefore ?? defaultHoursBefore;
    if (!isWithinReminderWindow(session.scheduled_at, args.now, hoursBefore, args.windowHalfHours)) {
      return false;
    }

    seen.add(session.id);
    return true;
  });
}
