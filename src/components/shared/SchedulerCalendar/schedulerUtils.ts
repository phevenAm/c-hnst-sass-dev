import dayjs from "dayjs";

import type {
  AdminPrivateEvent,
  AvailabilityOverride,
  AvailabilityRule,
  Session,
  UserProfile,
} from "@/models/globalTypes";

// ============================================================
// SCHEDULER UTILS
//
// Pure helpers for turning DB rows (sessions, availability rules,
// overrides) into react-big-calendar events. Kept out of the page
// component so the mapping logic is easy to read and unit-test.
// ============================================================

// What each calendar event carries in its `resource` field, so the
// event renderer and click handler know what they're looking at.
export type SchedulerResource =
  | { type: "session"; session: Session; color: string; clientName: string }
  | { type: "window"; label: string; source: "rule" | "override" }
  | { type: "blocked"; label: string }
  | { type: "private"; event: AdminPrivateEvent };

export type SchedulerEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: SchedulerResource;
};

// Fixed palette — client colour is derived from their id so it's stable
// across sessions without needing a colour column in the DB. Every tone is
// dark enough that white event text clears WCAG AA 4.5:1 contrast.
const CLIENT_PALETTE = [
  "#3a5568", // slate blue
  "#8f3f3f", // brick red
  "#3f5a3a", // forest
  "#4c4478", // indigo
  "#2b5a66", // deep teal
  "#6f4a24", // brown
  "#4d5730", // moss
  "#6b3f54", // plum
];

// Deterministic hash → palette index. Same client always gets the same colour.
export function colourForClient(clientId: string | null | undefined): string {
  if (!clientId) return "#4b5563"; // dark grey fallback (AA-safe with white text)
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return CLIENT_PALETTE[hash % CLIENT_PALETTE.length];
}

// "HH:MM:SS" (Postgres time) → { hour, minute }
function timeParts(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(":");
  return { hour: Number(h), minute: Number(m) };
}

// Combine a calendar day with a "HH:MM:SS" time into a JS Date.
function at(day: dayjs.Dayjs, time: string): Date {
  const { hour, minute } = timeParts(time);
  return day.hour(hour).minute(minute).second(0).millisecond(0).toDate();
}

function clientNameFor(session: Session, users: UserProfile[]): string {
  const u = users.find((x) => x.id === session.client_id);
  if (!u) return "Unknown client";
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Client";
}

// Map real sessions → calendar events. Cancelled sessions are dropped.
export function sessionEvents(sessions: Session[], users: UserProfile[]): SchedulerEvent[] {
  return sessions
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const end = dayjs(start)
        .add(s.duration_minutes ?? 50, "minute")
        .toDate();
      const clientName = clientNameFor(s, users);
      return {
        id: `session-${s.id}`,
        title: clientName,
        start,
        end,
        resource: { type: "session", session: s, color: colourForClient(s.client_id), clientName },
      };
    });
}

// Map the signed-in client's OWN sessions to calendar events. All share one
// calm colour and a generic "Session" label (the client knows they're theirs).
export function clientSessionEvents(sessions: Session[]): SchedulerEvent[] {
  return sessions
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const end = dayjs(start)
        .add(s.duration_minutes ?? 50, "minute")
        .toDate();
      return {
        id: `session-${s.id}`,
        title: "Session",
        start,
        end,
        resource: { type: "session", session: s, color: "#3a5568", clientName: "Session" },
      };
    });
}

// Map the admin's private events → calendar events. Admin view only; clients
// never receive these rows (no client RLS policy on admin_private_events).
export function privateEventEvents(events: AdminPrivateEvent[]): SchedulerEvent[] {
  return events.map((e) => ({
    id: `private-${e.id}`,
    title: e.title,
    start: new Date(e.starts_at),
    end: new Date(e.ends_at),
    resource: { type: "private", event: e },
  }));
}

// Expand recurring rules + overrides into window/blocked events for the
// seven days of the week containing `focusDate`.
//
//   - Full-day block override (times null) removes that day's rule windows.
//   - Partial block override (times present) renders as a red "Blocked" event.
//   - Added window override (is_blocked false) renders an extra green window.
export function availabilityEvents(
  focusDate: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
): SchedulerEvent[] {
  const events: SchedulerEvent[] = [];
  const weekStart = dayjs(focusDate).startOf("week"); // Sunday

  for (let i = 0; i < 7; i++) {
    const day = weekStart.add(i, "day");
    const dayStr = day.format("YYYY-MM-DD");
    const dow = day.day();

    const dayOverrides = overrides.filter((o) => o.override_date === dayStr);
    const fullDayBlocked = dayOverrides.some((o) => o.is_blocked && !o.start_time);

    // Recurring windows for this weekday (unless the whole day is blocked)
    if (!fullDayBlocked) {
      rules
        .filter((r) => r.day_of_week === dow)
        .forEach((r) => {
          events.push({
            id: `rule-${r.id}-${dayStr}`,
            title: r.label || "Available",
            start: at(day, r.start_time),
            end: at(day, r.end_time),
            resource: { type: "window", label: r.label || "Available", source: "rule" },
          });
        });
    }

    // One-off overrides on this date
    dayOverrides.forEach((o) => {
      if (o.is_blocked && o.start_time && o.end_time) {
        events.push({
          id: `block-${o.id}`,
          title: o.label || "Blocked",
          start: at(day, o.start_time),
          end: at(day, o.end_time),
          resource: { type: "blocked", label: o.label || "Blocked" },
        });
      } else if (!o.is_blocked && o.start_time && o.end_time) {
        events.push({
          id: `extra-${o.id}`,
          title: o.label || "Available",
          start: at(day, o.start_time),
          end: at(day, o.end_time),
          resource: { type: "window", label: o.label || "Available", source: "override" },
        });
      }
    });
  }

  return events;
}

// A concrete bookable time range on a specific day.
export type TimeWindow = { start: Date; end: Date };

// Subtract interval `b` from window `w`, returning the 0–2 remaining pieces.
function subtractInterval(w: TimeWindow, b: TimeWindow): TimeWindow[] {
  // No overlap → window survives whole.
  if (b.end.getTime() <= w.start.getTime() || b.start.getTime() >= w.end.getTime()) return [w];
  const pieces: TimeWindow[] = [];
  if (b.start.getTime() > w.start.getTime()) pieces.push({ start: w.start, end: b.start });
  if (b.end.getTime() < w.end.getTime()) pieces.push({ start: b.end, end: w.end });
  return pieces;
}

// The NET bookable windows for a single date, from the same rules + overrides
// the calendar renders. Full-day block → nothing; extra-window overrides add
// windows; partial block overrides are subtracted out. Used by the client
// reschedule picker to constrain which days/times can be requested.
export function bookableWindowsForDate(
  date: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
): TimeWindow[] {
  const day = dayjs(date);
  const dayStr = day.format("YYYY-MM-DD");
  const dow = day.day();

  const dayOverrides = overrides.filter((o) => o.override_date === dayStr);
  if (dayOverrides.some((o) => o.is_blocked && !o.start_time)) return [];

  let windows: TimeWindow[] = [];
  rules
    .filter((r) => r.day_of_week === dow)
    .forEach((r) => windows.push({ start: at(day, r.start_time), end: at(day, r.end_time) }));
  dayOverrides
    .filter((o) => !o.is_blocked && o.start_time && o.end_time)
    .forEach((o) => windows.push({ start: at(day, o.start_time!), end: at(day, o.end_time!) }));

  dayOverrides
    .filter((o) => o.is_blocked && o.start_time && o.end_time)
    .forEach((o) => {
      const block = { start: at(day, o.start_time!), end: at(day, o.end_time!) };
      windows = windows.flatMap((w) => subtractInterval(w, block));
    });

  return windows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
