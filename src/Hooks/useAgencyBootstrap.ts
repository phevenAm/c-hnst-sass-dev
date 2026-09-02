import { useEffect, useRef } from "react";

import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { bootstrapAgency } from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";

const PENDING_INVITE_KEY = "pendingAgencyInvite";

export function stashPendingAgencyInvite(token: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    /* private mode — the CounsellorSignupPage inline consume still covers the happy path */
  }
}

// Runs once per authenticated session: consumes any invite token left behind by
// the sign-up flow (covers the email-confirmation path, where the token can't be
// consumed inline), then loads the current user's agency membership into Redux.
export function useAgencyBootstrap() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, loading } = useAuth();
  const status = useAppSelector((s) => s.agency.bootstrapStatus);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !isAuthenticated) return;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || ranFor.current === uid) return;
      ranFor.current = uid;

      let pending: string | null = null;
      try {
        pending = localStorage.getItem(PENDING_INVITE_KEY);
      } catch {
        /* ignore */
      }

      if (pending) {
        try {
          await supabase.rpc("consume_agency_invite", { input_token: pending });
        } catch (err) {
          console.error("consume_agency_invite failed", err);
        } finally {
          try {
            localStorage.removeItem(PENDING_INVITE_KEY);
          } catch {
            /* ignore */
          }
        }
      }

      dispatch(bootstrapAgency());
    })();
  }, [isAuthenticated, loading, dispatch]);

  // Re-fetch if a caller reset the slice (RESET_ALL) back to idle mid-session.
  useEffect(() => {
    if (!loading && isAuthenticated && status === "idle" && ranFor.current) {
      dispatch(bootstrapAgency());
    }
  }, [status, isAuthenticated, loading, dispatch]);
}
