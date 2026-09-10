import { useAuth } from "@context/AuthContext";
import { useAppSelector } from "@store/hooks";
import { selectIsAgencyMember } from "@store/slices/agencySlice";

import { isFeatureEnabled } from "@/lib/featureFlags";

/**
 * Whether the signed-in admin has the file manager (`/admin/files`).
 *
 * It's a Growth+ perk: Starter gets 0 bytes of storage (see the `plan_limits`
 * table + migration 20260910130000), so the page is hidden for that tier.
 * Agency members always have it — their files count against the shared agency
 * pool, and agencies skip plan limits entirely.
 *
 * Mirrors the server-side backstop: on Starter `file_storage_quota` returns 0,
 * so `file_enforce_quota` rejects every upload even if the route is reached.
 */
export function useHasFileManager(): boolean {
  const { practiceSettings } = useAuth();
  const isAgencyMember = useAppSelector(selectIsAgencyMember);

  if (!isFeatureEnabled("fileManager")) return false;
  if (isAgencyMember) return true;

  const plan = (practiceSettings?.subscription_plan as string | undefined) ?? "starter";
  return plan !== "starter";
}
