import { useAppSelector } from "@store/hooks";
import { selectIsAgencyMember } from "@store/slices/agencySlice";

import { isFeatureEnabled } from "@/lib/featureFlags";

/**
 * Whether the signed-in admin has the file manager (`/admin/files`).
 *
 * Agency-only (2026-09-14): file storage is an agency perk, not a solo-admin
 * tier one — a solo admin never sees Files regardless of plan, even Growth/
 * Unlimited, which still carry a `plan_limits.max_storage_bytes` quota in the
 * DB (2.5/10 GiB) that's currently unused by this gate. If those tiers are
 * meant to advertise storage again later, reinstate the `plan !== "starter"`
 * branch below — and update the Settings/SubscribePage/promo copy that still
 * markets per-tier storage to match whichever way this goes.
 */
export function useHasFileManager(): boolean {
  const isAgencyMember = useAppSelector(selectIsAgencyMember);

  if (!isFeatureEnabled("fileManager")) return false;
  return isAgencyMember;
}
