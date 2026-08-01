import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { formatSessionDate } from "./sessionDate";

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
