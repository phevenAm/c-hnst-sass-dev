import { useNavigate } from "react-router-dom";

import { usePlanCapacity } from "@Hooks/usePlanCapacity";
import { useAuth } from "@context/AuthContext";

import styles from "./ClientCapBanner.module.scss";

const SUBSCRIPTION_SETTINGS = "/settings?tab=billing&section=subscription";

/**
 * Warns an admin when they're at (or one away from) their plan's active-client
 * cap. Renders nothing while capacity is loading, on an unlimited plan, on a
 * demo login, or when there's still more than one slot free.
 */
export default function ClientCapBanner() {
  const navigate = useNavigate();
  const { isAdmin, isDemo, practiceSettings } = useAuth();
  const { active, maxActive } = usePlanCapacity();

  if (!isAdmin || isDemo || active == null || maxActive == null) return null;

  const remaining = maxActive - active;
  if (remaining > 1) return null;

  const planName = (practiceSettings?.subscription_plan as string | undefined) ?? "your";

  let headline: string;
  if (remaining < 0) {
    headline = `Over your plan limit — ${active} active clients on the ${planName} plan (${maxActive} included).`;
  } else if (remaining === 0) {
    headline = `Client limit reached — all ${maxActive} slots on the ${planName} plan are in use.`;
  } else {
    headline = `1 client slot left — ${active} of ${maxActive} in use on the ${planName} plan.`;
  }

  return (
    <div className={`${styles.banner} ${remaining <= 0 ? styles.urgent : ""}`} role="status">
      <span className={styles.message}>
        <strong>{headline}</strong> Archive a client or move to a larger plan to add more.
      </span>
      <button type="button" className={styles.btn} onClick={() => navigate(SUBSCRIPTION_SETTINGS)}>
        See plans
      </button>
    </div>
  );
}
