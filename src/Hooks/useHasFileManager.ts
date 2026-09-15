import { useEffect, useState } from "react";

import { useAppSelector } from "@store/hooks";
import { selectIsAgencyManager, selectIsAgencyMember } from "@store/slices/agencySlice";

import { isFeatureEnabled } from "@/lib/featureFlags";
import { supabase } from "@/lib/supabase";

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
 *
 * Manager vs. staff (2026-09-15): a manager always gets Files — they're the
 * one who'd populate it in the first place, and need the empty state to do
 * that. Staff only get it once the agency has actually shared something —
 * showing an always-empty folder to every hire, whether or not their agency
 * uses shared resources, was the actual complaint. The check relies entirely
 * on file_folders/file_objects' existing RLS ("shared and agency_id =
 * current_agency_id()", see 20260909000400_file_manager.sql) rather than a
 * new RPC — any active member, manager or not, can already read that a
 * shared row exists; we just check whether one does.
 */
export function useHasFileManager(): boolean {
  const isAgencyMember = useAppSelector(selectIsAgencyMember);
  const isAgencyManager = useAppSelector(selectIsAgencyManager);
  const featureOn = isFeatureEnabled("fileManager");
  const staffNeedsCheck = featureOn && isAgencyMember && !isAgencyManager;

  const [staffHasSharedFiles, setStaffHasSharedFiles] = useState(false);

  useEffect(() => {
    if (!staffNeedsCheck) return;
    let cancelled = false;

    (async () => {
      const [{ data: folders }, { data: files }] = await Promise.all([
        supabase.from("file_folders").select("id").eq("shared", true).limit(1),
        supabase.from("file_objects").select("id").eq("shared", true).limit(1),
      ]);
      if (!cancelled) setStaffHasSharedFiles(!!folders?.length || !!files?.length);
    })();

    return () => {
      cancelled = true;
    };
  }, [staffNeedsCheck]);

  if (!featureOn || !isAgencyMember) return false;
  return isAgencyManager || staffHasSharedFiles;
}
