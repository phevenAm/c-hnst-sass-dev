import { useEffect } from "react";

import { useAuth } from "@context/AuthContext";
import { fetchQuestionnaires } from "@store/slices/questionnairesSlice";

import { supabase } from "@/lib/supabase.js";
import { useAppDispatch } from "@/store/hooks";

// ClientDashboard/CheckInPage derive "assigned to me" from questionnaires'
// embedded questionnaire_assignments(user_id) join, fetched once on mount —
// a client already sitting on the dashboard when an admin assigns a new
// form never sees it (no badge, no dashboard change) until they navigate
// away and back and the fetch re-runs. Re-running that same fetch on a new
// assignment row is simpler and more correct than trying to hand-splice the
// realtime INSERT payload (which has no questions/tags to embed) into
// existing state.
export function useAssignmentsRealtime() {
  const { authUser, isAdmin } = useAuth();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!authUser || isAdmin) return;

    const channel = supabase
      .channel(`assignments-realtime:${authUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "questionnaire_assignments", filter: `user_id=eq.${authUser.id}` },
        () => {
          dispatch(fetchQuestionnaires());
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUser, isAdmin, dispatch]);
}
