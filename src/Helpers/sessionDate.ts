import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

// Single source of truth for session date handling across the app.
//
// Display helpers (formatSessionDate, formatDate, formatTime) drive UI labels.
// csvToIso handles the DB-submission layer — converts raw CSV strings to ISO-8601.
//
// Kept in its own module (no component imports) so it stays cheap to import and
// unit-testable — importing from Helpers.tsx drags in the component barrel.

export const formatSessionDate = (scheduledAt: string): string => {
  const scheduled = dayjs(scheduledAt);
  if (scheduled.isSame(dayjs(), "day")) return `Today at ${scheduled.format("h:mma")}`;
  if (scheduled.isSame(dayjs().add(1, "day"), "day")) return `Tomorrow at ${scheduled.format("h:mma")}`;
  return scheduled.format("dddd D MMM · h:mma");
};

/** Short date only: "1 May 2026" */
export const formatDate = (iso: string): string => dayjs(iso).format("D MMM YYYY");

/** Time only: "10:00am" */
export const formatTime = (iso: string): string => dayjs(iso).format("h:mma");

// Accepted CSV date formats — tried in order. DD/MM/YYYY is listed first since
// that's the UK default and matches what spreadsheet apps export in en-GB locale.
const CSV_DATE_FORMATS = ["DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD"];

/**
 * Converts a CSV date + time into an ISO-8601 string for DB storage.
 * Accepts DD/MM/YYYY (spreadsheet default) and YYYY-MM-DD. Parses as local
 * time so the stored UTC value round-trips correctly to the entered local time.
 * Returns null when the date is missing or not a valid calendar date.
 */
export function csvToIso(date: string, time = "09:00"): string | null {
  if (!date) return null;
  for (const fmt of CSV_DATE_FORMATS) {
    const dt = dayjs(`${date} ${time}`, `${fmt} HH:mm`, true);
    if (dt.isValid()) return dt.toISOString();
  }
  return null;
}
