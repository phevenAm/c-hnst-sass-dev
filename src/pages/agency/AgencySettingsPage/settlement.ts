// "Who pays who" between an agency and a staff member. Mirrors the DB resolver
// public.agency_member_settlement() (20260907000032_agency_settlement_direction).

import type { AgencySettlementDefault, AgencySettlementDirection } from "@models/agency";

export const SETTLEMENT_LABEL: Record<AgencySettlementDirection, string> = {
  staff_pays_agency: "Staff pays the agency",
  agency_pays_staff: "Agency pays the staff member",
  none: "No internal settlement",
};

export const SETTLEMENT_DEFAULT_LABEL: Record<AgencySettlementDefault, string> = {
  auto: "Automatic — by employment type (employees paid by the agency, freelancers pay the agency)",
  ...SETTLEMENT_LABEL,
};

/** Effective direction for one member: explicit override → pinned agency default
 *  → derived from employment type. */
export function effectiveSettlement(
  override: AgencySettlementDirection | null,
  agencyDefault: AgencySettlementDefault,
  employmentType: "employee" | "freelance",
): AgencySettlementDirection {
  if (override) return override;
  if (agencyDefault !== "auto") return agencyDefault;
  return employmentType === "employee" ? "agency_pays_staff" : "staff_pays_agency";
}
