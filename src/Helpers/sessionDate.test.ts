import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { csvToIso, formatDate, formatSessionDate, formatTime } from "./sessionDate";

describe("formatSessionDate", () => {
  it("says 'Today at ...' for a session later today", () => {
    const at = dayjs().hour(14).minute(0).second(0).toISOString();
    expect(formatSessionDate(at)).toBe(`Today at ${dayjs(at).format("h:mma")}`);
  });

  it("says 'Tomorrow at ...' for a session the next day", () => {
    const at = dayjs().add(1, "day").hour(9).minute(30).toISOString();
    expect(formatSessionDate(at)).toBe(`Tomorrow at ${dayjs(at).format("h:mma")}`);
  });

  it("falls back to weekday + date (no year) for anything further out", () => {
    const at = dayjs().add(5, "day").hour(11).minute(0).toISOString();
    expect(formatSessionDate(at)).toBe(dayjs(at).format("dddd D MMM · h:mma"));
  });
});

describe("formatDate", () => {
  it("renders a short day-month-year date", () => {
    expect(formatDate("2026-05-01T09:00:00.000Z")).toBe("1 May 2026");
  });

  it("does not zero-pad the day", () => {
    expect(formatDate("2026-12-09T00:00:00.000Z")).toBe("9 Dec 2026");
  });
});

describe("formatTime", () => {
  it("renders a lower-case 12-hour time", () => {
    const iso = dayjs().hour(10).minute(0).second(0).toISOString();
    expect(formatTime(iso)).toBe("10:00am");
  });

  it("renders afternoon times as pm", () => {
    const iso = dayjs().hour(16).minute(45).second(0).toISOString();
    expect(formatTime(iso)).toBe("4:45pm");
  });
});

describe("csvToIso", () => {
  it("parses the UK spreadsheet default DD/MM/YYYY", () => {
    // 14 March 2026, 09:00 local → round-trips back to the same local time
    const iso = csvToIso("14/03/2026");
    expect(iso).not.toBeNull();
    expect(dayjs(iso as string).format("YYYY-MM-DD HH:mm")).toBe("2026-03-14 09:00");
  });

  it("parses single-digit day/month D/M/YYYY", () => {
    const iso = csvToIso("3/7/2026");
    expect(dayjs(iso as string).format("YYYY-MM-DD")).toBe("2026-07-03");
  });

  it("parses ISO-style YYYY-MM-DD", () => {
    const iso = csvToIso("2026-07-03");
    expect(dayjs(iso as string).format("YYYY-MM-DD")).toBe("2026-07-03");
  });

  it("applies a supplied time instead of the 09:00 default", () => {
    const iso = csvToIso("14/03/2026", "13:30");
    expect(dayjs(iso as string).format("HH:mm")).toBe("13:30");
  });

  it("returns null for a missing date", () => {
    expect(csvToIso("")).toBeNull();
  });

  it("returns null for a non-calendar date (strict parsing)", () => {
    expect(csvToIso("32/01/2026")).toBeNull();
    expect(csvToIso("14/13/2026")).toBeNull();
  });

  it("returns null for an unrecognised format", () => {
    expect(csvToIso("March 14, 2026")).toBeNull();
    expect(csvToIso("03-14-2026")).toBeNull();
  });
});
