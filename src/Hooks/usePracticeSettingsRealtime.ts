import { useEffect } from "react";

import { useAuth } from "@context/AuthContext";
import { fetchPracticeSettings } from "@store/slices/practiceSettingsSlice";

import { supabase } from "@/lib/supabase.js";
import { useAppDispatch } from "@/store/hooks";

export function usePracticeSettingsRealtime() {
  const { authUser, userProfile, isAdmin } = useAuth();
  const dispatch = useAppDispatch();

  // Admins own the row (admin_id = their own id); clients read their own
  // admin's row (admin_id = userProfile.admin_id). Either way, re-fetching
  // the shared cache on any UPDATE means every open tab — the admin's own
  // other tabs, or a client viewing their data — picks up a saved change
  // within moments instead of only on next reload.
  const effectiveAdminId = isAdmin ? authUser?.id : userProfile?.admin_id;

  useEffect(() => {
    if (!effectiveAdminId) return;

    const channel = supabase
      .channel(`practice-settings-realtime:${effectiveAdminId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "practice_settings", filter: `admin_id=eq.${effectiveAdminId}` },
        () => {
          dispatch(fetchPracticeSettings());
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveAdminId, dispatch]);
}
