import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import styles from "./UnsubscribePage.module.scss";

const TYPE_LABELS: Record<string, string> = {
  session_reminder: "session reminder emails",
  session_booked: "session booking confirmation emails",
  session_cancelled: "session cancellation emails",
  session_rescheduled: "session rescheduled emails",
  payment_confirmed: "payment confirmation emails",
  questionnaire_assigned: "new check-in notification emails",
};

type PageState = "loading" | "success" | "already" | "error";

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type") ?? "";
  const [state, setState] = useState<PageState>("loading");

  const typeLabel = TYPE_LABELS[type] ?? "these emails";

  useEffect(() => {
    if (!token || !type) {
      setState("error");
      return;
    }

    const url = new URL(
      `/functions/v1/handle-unsubscribe?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`,
      import.meta.env.VITE_SUPABASE_URL,
    );

    fetch(url.toString(), { method: "GET" })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.already) {
          setState("already");
        } else if (data.ok) {
          setState("success");
        } else {
          setState("error");
        }
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>Clarity</p>

        {state === "loading" && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.message}>Processing your request&hellip;</p>
          </>
        )}

        {state === "success" && (
          <>
            <div className={styles.icon} aria-hidden="true">
              ✓
            </div>
            <h1 className={styles.heading}>You&rsquo;ve been unsubscribed</h1>
            <p className={styles.body}>
              You will no longer receive <strong>{typeLabel}</strong> from Clarity.
            </p>
            <p className={styles.note}>
              Other types of notification emails will continue unless you unsubscribe from those separately.
            </p>
          </>
        )}

        {state === "already" && (
          <>
            <div className={styles.icon} aria-hidden="true">
              ✓
            </div>
            <h1 className={styles.heading}>Already unsubscribed</h1>
            <p className={styles.body}>
              You&rsquo;re already opted out of <strong>{typeLabel}</strong>.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <div className={`${styles.icon} ${styles.iconError}`} aria-hidden="true">
              ✕
            </div>
            <h1 className={styles.heading}>Invalid link</h1>
            <p className={styles.body}>
              This unsubscribe link is not valid or has already been used. If you continue to receive unwanted emails,
              please contact your therapist directly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
