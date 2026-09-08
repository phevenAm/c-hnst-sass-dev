import { useEffect, useRef } from "react";

import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { bootstrapAgency } from "@store/slices/agencySlice";

import { isFeatureEnabled } from "@/lib/featureFlags";
import { supabase } from "@/lib/supabase";

const PENDING_INVITE_KEY = "pendingAgencyInvite";
const PENDING_AGREEMENT_KEY = "pendingAgencyInviteAgreement";

type PendingAgreement = { accepted: boolean; signedName: string };

export function stashPendingAgencyInvite(token: string, agreement?: PendingAgreement) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    if (agreement) localStorage.setItem(PENDING_AGREEMENT_KEY, JSON.stringify(agreement));
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
  const agencyEnabled = isFeatureEnabled("agency");

  useEffect(() => {
    if (!agencyEnabled || loading || !isAuthenticated) return;

    (async () => {
      // getSession(), not getUser(): no /auth/v1/user round trip and no
      // auth-token lock held across the network (see agencySlice.bootstrapAgency).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || ranFor.current === uid) return;
      ranFor.current = uid;

      let pending: string | null = null;
      let agreement: PendingAgreement | null = null;
      try {
        pending = localStorage.getItem(PENDING_INVITE_KEY);
        const raw = localStorage.getItem(PENDING_AGREEMENT_KEY);
        agreement = raw ? (JSON.parse(raw) as PendingAgreement) : null;
      } catch {
        /* ignore */
      }

      if (pending) {
        try {
          await supabase.rpc("consume_agency_invite", {
            input_token: pending,
            p_agreement_accepted: agreement?.accepted ?? false,
            p_signed_name: agreement?.signedName ?? null,
          });
        } catch (err) {
          console.error("consume_agency_invite failed", err);
        } finally {
          try {
            localStorage.removeItem(PENDING_INVITE_KEY);
            localStorage.removeItem(PENDING_AGREEMENT_KEY);
          } catch {
            /* ignore */
          }
        }
      }

      dispatch(bootstrapAgency());
    })();
  }, [agencyEnabled, isAuthenticated, loading, dispatch]);

  // Re-fetch if a caller reset the slice (RESET_ALL) back to idle mid-session.
  useEffect(() => {
    if (!agencyEnabled) return;
    if (!loading && isAuthenticated && status === "idle" && ranFor.current) {
      dispatch(bootstrapAgency());
    }
  }, [agencyEnabled, status, isAuthenticated, loading, dispatch]);
}
