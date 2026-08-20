import { useEffect } from "react";

import { useAuth } from "@context/AuthContext";
import { upsertSession } from "@store/slices/sessionsSlice";

import { supabase } from "@/lib/supabase.js";
import type { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";

export function useSessionsRealtime() {
  const { authUser, isAdmin } = useAuth();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!authUser) return;

    // Admins see every session they own; clients only ever see their own —
    // same UPDATE feed, just scoped by whichever FK matches the signed-in
    // role. Without this, a client's already-open tab has no way to learn
    // a session changed (reschedule, payment approved, cancellation) short
    // of a manual reload — the only signal was ever the optional email/
    // in-app notification a change might also trigger.
    const filterColumn = isAdmin ? "created_by" : "client_id";
    const channel = supabase
      .channel(`sessions-realtime:${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `${filterColumn}=eq.${authUser.id}` },
        (payload) => {
          dispatch(upsertSession(payload.new as Session));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser, isAdmin, dispatch]);
}
