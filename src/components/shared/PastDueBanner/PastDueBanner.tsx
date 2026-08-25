import { useState } from "react";

import { FunctionsHttpError } from "@supabase/supabase-js";

import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./PastDueBanner.module.scss";

export default function PastDueBanner() {
  const { isAdmin, isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!isAdmin || isDemo || practiceSettings?.subscription_status !== "past_due") return null;

  const handleUpdatePayment = async () => {
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-billing-portal-session");
      if (fnError) {
        // supabase-js only gives a generic "non-2xx status code" message by default —
        // the real reason is in the response body.
        let message = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          const body = await fnError.context.json().catch(() => null);
          if (body?.error) message = body.error;
        }
        throw new Error(message);
      }
      if (!data?.url) throw new Error("No portal URL returned");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "danger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.message}>
        <strong>Payment failed</strong> — update your payment method to keep your account active.
      </span>
      <button type="button" className={styles.btnUpdate} onClick={handleUpdatePayment} disabled={loading}>
        {loading ? "Opening…" : "Update payment method"}
      </button>
    </div>
  );
}
