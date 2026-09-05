import { describe, expect, it } from "vitest";

import { formatPence, poundsToPence, staffSeatUsage } from "./agencyFormat";

describe("formatPence / poundsToPence", () => {
  it("formats pence as a GBP string", () => {
    expect(formatPence(420050)).toBe("£4,200.50");
    expect(formatPence(0)).toBe("£0.00");
    expect(formatPence(null)).toBe("£0.00");
  });

  it("round-trips pounds to pence", () => {
    expect(poundsToPence("42.50")).toBe(4250);
    expect(poundsToPence(42.5)).toBe(4250);
    expect(poundsToPence("not a number")).toBeNull();
  });
});

describe("staffSeatUsage — the staff-count tier boundaries", () => {
  it("under the cap: not over, not at limit", () => {
    expect(staffSeatUsage(9, 10)).toMatchObject({ over: false, atLimit: false, unlimited: false });
  });

  it("exactly at the cap (10 of 10, tier 1's boundary): at limit but not over", () => {
    expect(staffSeatUsage(10, 10)).toMatchObject({ over: false, atLimit: true, pct: 100 });
  });

  it("one past the cap (11 of 10): over and at limit", () => {
    expect(staffSeatUsage(11, 10)).toMatchObject({ over: true, atLimit: true });
  });

  it("tier 2 boundary: 20 of 20 is at limit, 21 of 20 is over", () => {
    expect(staffSeatUsage(20, 20)).toMatchObject({ over: false, atLimit: true });
    expect(staffSeatUsage(21, 20)).toMatchObject({ over: true, atLimit: true });
  });

  it("unlimited tier (max null) is never over or at limit", () => {
    expect(staffSeatUsage(500, null)).toMatchObject({ over: false, atLimit: false, unlimited: true, pct: 100 });
  });

  it("percentage is clamped at 100 even past the cap", () => {
    expect(staffSeatUsage(15, 10).pct).toBe(100);
  });

  it("zero staff and a zero-or-more cap doesn't divide by zero", () => {
    expect(() => staffSeatUsage(0, 10)).not.toThrow();
    expect(staffSeatUsage(0, 10).pct).toBe(0);
  });
});
