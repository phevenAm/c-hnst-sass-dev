import { useAppSelector } from "@store/hooks";
import { selectAgency, selectIsAgencyManager, selectIsAgencyMember } from "@store/slices/agencySlice";

/**
 * Whether the signed-in admin may create a new form/resource of their own.
 * Solo admins and agency managers always can — the gate only applies to
 * non-manager agency staff, and only when their agency hasn't opted them in
 * (agencies.allow_staff_forms / allow_staff_resources, both default false).
 * Mirrors the RESTRICTIVE insert-only RLS policy in
 * 20260915000030_agency_staff_sharing_and_permissions.sql — this hook is a UI
 * convenience (hide the button); the real enforcement is server-side.
 */
function useAgencyCreatePermission(agencyFlag: "allow_staff_forms" | "allow_staff_resources"): boolean {
  const isAgencyMember = useAppSelector(selectIsAgencyMember);
  const isAgencyManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);

  if (!isAgencyMember || isAgencyManager) return true;
  return !!agency?.[agencyFlag];
}

export const useCanCreateForms = () => useAgencyCreatePermission("allow_staff_forms");
export const useCanCreateResources = () => useAgencyCreatePermission("allow_staff_resources");
