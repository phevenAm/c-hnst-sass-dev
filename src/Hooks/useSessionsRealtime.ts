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
    if (!authUser || !isAdmin) return;

    const channel = supabase
      .channel(`sessions-realtime:${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `created_by=eq.${authUser.id}` },
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
