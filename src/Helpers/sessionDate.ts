import dayjs from "dayjs";

// Single source of truth for how a session's date is shown across the app.
// Near-future sessions read "Today at 2:00pm" / "Tomorrow at 2:00pm"; anything
// else falls back to a full weekday + date. No year — these are always near-term.
//
// Kept in its own module (no component imports) so it stays cheap to import and
// unit-testable — importing from Helpers.tsx drags in the component barrel.
export const formatSessionDate = (scheduledAt: string): string => {
  const scheduled = dayjs(scheduledAt);
  if (scheduled.isSame(dayjs(), "day")) return `Today at ${scheduled.format("h:mma")}`;
  if (scheduled.isSame(dayjs().add(1, "day"), "day")) return `Tomorrow at ${scheduled.format("h:mma")}`;
  return scheduled.format("dddd D MMM · h:mma");
};
