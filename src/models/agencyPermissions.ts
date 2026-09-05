// Small, pure permission checks pulled out of AgencyMembersPage/RemoveMemberModal
// so they have one definition and can be unit tested directly — the actual
// authorization is always enforced server-side (RLS + the edge functions'
// own checks); these mirror that logic for UI decisions only.

import type { Agency, AgencyMember } from "./agency";

/** True when the given user is the agency's owner (can't be demoted/disabled/removed). */
export function isAgencyOwner(userId: string | null | undefined, agency: Pick<Agency, "owner_id"> | null): boolean {
  if (!userId || !agency) return false;
  return userId === agency.owner_id;
}

/** True for an active member with the manager role — mirrors the DB's is_agency_manager(). */
export function isActiveManager(membership: Pick<AgencyMember, "role" | "status"> | null): boolean {
  return !!membership && membership.role === "manager" && membership.status === "active";
}

/** True for any active membership, manager or counsellor. */
export function isActiveMember(membership: Pick<AgencyMember, "status"> | null): boolean {
  return !!membership && membership.status === "active";
}
