import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./SubscribePage.module.scss";

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      showToast("Subscription cancelled — you can try again any time.", "warning");
    }
  }, []);

  const handleSubscribe = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-subscription-checkout");
      if (fnError) throw new Error(fnError.message);
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className={`inner ${styles.container}`}>
        <h1 className={styles.heading}>Start your WithMe subscription</h1>
        <p className={styles.price}>£12 / month &mdash; cancel any time</p>

        <ul className={styles.features}>
          <li>Manage clients, sessions, questionnaires and resources</li>
          <li>Accept payments by bank transfer or Stripe card</li>
          <li>Real-time session tracking and practice dashboard</li>
          <li>Client check-ins and progress overview</li>
        </ul>

        {error && <p className={styles.error}>{error}</p>}

        <Button onClick={handleSubscribe} disabled={loading}>
          {loading ? "Redirecting to payment…" : "Subscribe — £12 / month"}
        </Button>
      </div>
    </div>
  );
}
