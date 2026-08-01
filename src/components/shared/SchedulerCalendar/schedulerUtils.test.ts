import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import type { AvailabilityOverride, AvailabilityRule } from "@/models/globalTypes";
import { bookableWindowsForDate } from "./schedulerUtils";

// A concrete Friday to anchor the tests; day_of_week is derived so the test
// doesn't depend on knowing the weekday index by hand.
const DATE = new Date("2026-08-07T00:00:00");
const DOW = dayjs(DATE).day();
const DATE_STR = dayjs(DATE).format("YYYY-MM-DD");

const rule = (start: string, end: string): AvailabilityRule => ({
  id: `rule-${start}`,
  admin_id: "a",
  day_of_week: DOW,
  start_time: start,
  end_time: end,
  label: null,
  created_at: "",
});

const override = (o: Partial<AvailabilityOverride>): AvailabilityOverride => ({
  id: `ovr-${Math.random()}`,
  admin_id: "a",
  override_date: DATE_STR,
  start_time: null,
  end_time: null,
  is_blocked: true,
  label: null,
  created_at: "",
  ...o,
});

const asTimes = (windows: { start: Date; end: Date }[]) =>
  windows.map((w) => `${dayjs(w.start).format("HH:mm")}-${dayjs(w.end).format("HH:mm")}`);

describe("bookableWindowsForDate", () => {
  it("returns the rule window for a matching weekday", () => {
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], []))).toEqual(["12:00-16:00"]);
  });

  it("returns nothing when the weekday has no rule", () => {
    const otherRule = { ...rule("12:00", "16:00"), day_of_week: (DOW + 1) % 7 };
    expect(bookableWindowsForDate(DATE, [otherRule], [])).toEqual([]);
  });

  it("drops all windows on a full-day block override", () => {
    const block = override({ is_blocked: true, start_time: null, end_time: null });
    expect(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [block])).toEqual([]);
  });

  it("adds an extra one-off window override", () => {
    const extra = override({ is_blocked: false, start_time: "18:00", end_time: "19:00" });
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [extra]))).toEqual([
      "12:00-16:00",
      "18:00-19:00",
    ]);
  });

  it("splits a window around a partial block override", () => {
    const partial = override({ is_blocked: true, start_time: "13:00", end_time: "14:00" });
    expect(asTimes(bookableWindowsForDate(DATE, [rule("12:00", "16:00")], [partial]))).toEqual([
      "12:00-13:00",
      "14:00-16:00",
    ]);
  });
});
