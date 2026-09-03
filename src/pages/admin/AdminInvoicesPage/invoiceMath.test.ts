import { describe, expect, it } from "vitest";

import { formatReference, invoiceTotalPence, lineTotalPence, money } from "./invoiceMath";

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
});
