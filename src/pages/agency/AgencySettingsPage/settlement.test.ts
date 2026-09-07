import { describe, expect, it } from "vitest";

import { effectiveSettlement, SETTLEMENT_DEFAULT_LABEL, SETTLEMENT_LABEL } from "./settlement";

describe("effectiveSettlement", () => {
  it("an explicit per-member override wins over everything", () => {
    expect(effectiveSettlement("none", "staff_pays_agency", "employee")).toBe("none");
    expect(effectiveSettlement("agency_pays_staff", "auto", "freelance")).toBe("agency_pays_staff");
  });

  it("uses a pinned agency default when there is no override", () => {
    expect(effectiveSettlement(null, "staff_pays_agency", "employee")).toBe("staff_pays_agency");
    expect(effectiveSettlement(null, "none", "freelance")).toBe("none");
  });

  it("falls back to employment type when the agency default is 'auto'", () => {
    expect(effectiveSettlement(null, "auto", "employee")).toBe("agency_pays_staff");
    expect(effectiveSettlement(null, "auto", "freelance")).toBe("staff_pays_agency");
  });

  it("mirrors the DB resolver public.agency_member_settlement()", () => {
    // override → default(auto→employment) — same precedence the SQL uses.
    expect(effectiveSettlement("staff_pays_agency", "agency_pays_staff", "employee")).toBe("staff_pays_agency");
    expect(effectiveSettlement(null, "auto", "employee")).toBe("agency_pays_staff");
  });

  it("every direction and default has a human label", () => {
    for (const k of ["staff_pays_agency", "agency_pays_staff", "none"] as const) {
      expect(SETTLEMENT_LABEL[k]).toBeTruthy();
      expect(SETTLEMENT_DEFAULT_LABEL[k]).toBe(SETTLEMENT_LABEL[k]);
    }
    expect(SETTLEMENT_DEFAULT_LABEL.auto).toMatch(/employment type/i);
  });
});
