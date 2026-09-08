import { describe, expect, it } from "vitest";

import {
  formatReference,
  hexToRgb,
  initialDueDate,
  invoiceBandBrand,
  invoiceTotalPence,
  lineTotalPence,
  money,
} from "./invoiceMath";

describe("invoiceMath", () => {
  it("lineTotalPence multiplies quantity by unit and rounds to whole pence", () => {
    expect(lineTotalPence({ quantity: 3, unit_amount_pence: 5000 })).toBe(15000);
    expect(lineTotalPence({ quantity: 1, unit_amount_pence: 8500 })).toBe(8500);
    // 2.5 × 999p = 2497.5p → 2498p
    expect(lineTotalPence({ quantity: 2.5, unit_amount_pence: 999 })).toBe(2498);
  });

  it("lineTotalPence treats missing / NaN values as zero", () => {
    expect(lineTotalPence({ quantity: Number.NaN, unit_amount_pence: 5000 })).toBe(0);
    expect(lineTotalPence({ quantity: 2, unit_amount_pence: Number.NaN })).toBe(0);
  });

  it("invoiceTotalPence sums every line", () => {
    expect(
      invoiceTotalPence([
        { quantity: 2, unit_amount_pence: 5000 },
        { quantity: 1, unit_amount_pence: 2500 },
      ]),
    ).toBe(12500);
    expect(invoiceTotalPence([])).toBe(0);
  });

  it("formatReference pads to four digits", () => {
    expect(formatReference("INV-", 7)).toBe("INV-0007");
    expect(formatReference("INV-", 1234)).toBe("INV-1234");
    expect(formatReference("2026-", 42)).toBe("2026-0042");
    expect(formatReference("INV-", 99999)).toBe("INV-99999");
  });

  it("money formats pence as pounds", () => {
    expect(money(8500)).toBe("£85.00");
    expect(money(0)).toBe("£0.00");
    expect(money(2498)).toBe("£24.98");
  });

  it("initialDueDate adds the payment-terms window to a new invoice's issue date", () => {
    expect(initialDueDate(null, "2026-09-08", 14)).toBe("2026-09-22");
    expect(initialDueDate(null, "2026-09-08", 0)).toBe("2026-09-08");
    expect(initialDueDate(null, "2026-01-31", 30)).toBe("2026-03-02");
  });

  it("initialDueDate leaves a new invoice open-ended when there are no default terms", () => {
    expect(initialDueDate(null, "2026-09-08", null)).toBe("");
  });

  it("initialDueDate preserves an existing invoice's stored due date", () => {
    expect(initialDueDate({ due_date: "2026-10-01" }, "2026-09-08", 14)).toBe("2026-10-01");
    expect(initialDueDate({ due_date: null }, "2026-09-08", 14)).toBe("");
  });

  it("invoiceBandBrand uses the (trimmed) business name for the PDF's top band", () => {
    expect(invoiceBandBrand("Bright Path Counselling")).toBe("Bright Path Counselling");
    expect(invoiceBandBrand("  Bright Path  ")).toBe("Bright Path");
  });

  it("invoiceBandBrand falls back to 'Clarity' when there's no business name", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(invoiceBandBrand(empty)).toBe("Clarity");
    }
  });

  it("hexToRgb parses a 6-digit hex and rejects everything else", () => {
    expect(hexToRgb("#1f4940")).toEqual([31, 73, 64]);
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
    expect(hexToRgb("#abc")).toBeNull();
    expect(hexToRgb("1f4940")).toBeNull();
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb(null)).toBeNull();
    expect(hexToRgb(undefined)).toBeNull();
  });
});
