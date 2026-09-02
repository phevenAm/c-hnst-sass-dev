import { useEffect, useState } from "react";

import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

type State = {
  loading: boolean;
  active: number | null;
  maxActive: number | null;
  archived: number | null;
  maxArchived: number | null;
};

/**
 * Current-plan client usage for the signed-in admin, from the `plan_change_check`
 * RPC. Used to pre-empt the DB enforcement triggers with a friendly dialog before
 * an add-client / invite flow hits `PLAN_LIMIT_ACTIVE`.
 *
 * Degrades quietly: if the RPC / plan_limits table isn't deployed yet the counts
 * stay null and `atActiveLimit` is false, so nothing is gated.
 */
export function usePlanCapacity() {
  const { practiceSettings } = useAuth();
  const plan = (practiceSettings?.subscription_plan as string | undefined) ?? "starter";
  const [state, setState] = useState<State>({
    loading: true,
    active: null,
    maxActive: null,
    archived: null,
    maxArchived: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("plan_change_check", { p_target: plan });
        if (cancelled) return;
        if (data) {
          setState({
            loading: false,
            active: data.active,
            maxActive: data.max_active,
            archived: data.archived,
            maxArchived: data.max_archived,
          });
        } else {
          setState({ loading: false, active: null, maxActive: null, archived: null, maxArchived: null });
        }
      } catch {
        // Degrade quietly, per the contract above — the RPC may be missing
        // (not yet deployed) or unavailable (e.g. under test).
        if (!cancelled) {
          setState({ loading: false, active: null, maxActive: null, archived: null, maxArchived: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const atActiveLimit = state.maxActive != null && state.active != null && state.active >= state.maxActive;

  return { ...state, atActiveLimit };
}
