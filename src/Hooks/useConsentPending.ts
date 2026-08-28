import { useEffect, useState } from "react";

import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

export type ConsentSettings = {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
  consent_counsellor_cta: string;
};

// Shared by ConsentGate (which renders the blocking modal) and
// WalkthroughProvider (which needs to know not to start its prompt timer
// while that modal is up) — duplicating this RPC call between the two is
// cheap and infrequent (once per client session, only when consent is
// actually enabled), and far simpler than plumbing shared state between
// two components that aren't parent/child of each other.
export function useConsentPending(): {
  pending: boolean;
  settings: ConsentSettings | null;
  dismiss: () => void;
} {
  const { userProfile, isAdmin, loading } = useAuth();
  const [settings, setSettings] = useState<ConsentSettings | null>(null);

  useEffect(() => {
    if (loading || isAdmin || !userProfile || userProfile.has_consented) {
      setSettings(null);
      return;
    }
    supabase.rpc("get_my_admin_consent_settings").then(({ data }) => {
      const row = data?.[0];
      setSettings(row?.consent_enabled ? row : null);
    });
  }, [loading, isAdmin, userProfile]);

  return { pending: !!settings, settings, dismiss: () => setSettings(null) };
}
