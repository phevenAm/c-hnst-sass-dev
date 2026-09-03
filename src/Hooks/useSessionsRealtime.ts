import { useEffect } from "react";

import { useAuth } from "@context/AuthContext";
import { removeSession, upsertSession } from "@store/slices/sessionsSlice";

import { supabase } from "@/lib/supabase.js";
import type { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";

export function useSessionsRealtime() {
  const { authUser, isAdmin } = useAuth();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!authUser) return;

    // Admins see every session they own; clients only ever see their own —
    // same feed, just scoped by whichever FK matches the signed-in role.
    // Without this, an already-open tab has no way to learn a session
    // changed (reschedule, payment approved, cancellation), was added (a new
    // booking, or sessions imported when a stub client signs up), or was
    // deleted — short of a manual reload. A stale card acting on a session
    // that's already gone is what surfaces as a "session not found" 404.
    //
    // DELETE payloads carry the full old row because sessions is REPLICA
    // IDENTITY FULL (migration 20260903000017), so the filter still matches.
    const filterColumn = isAdmin ? "created_by" : "client_id";
    const channel = supabase
      .channel(`sessions-realtime:${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `${filterColumn}=eq.${authUser.id}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Session>;
            if (oldRow?.id) dispatch(removeSession(oldRow.id));
            return;
          }
          dispatch(upsertSession(payload.new as Session));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser, isAdmin, dispatch]);
}
