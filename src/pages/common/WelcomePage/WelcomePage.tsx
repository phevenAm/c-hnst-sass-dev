import { useNavigate } from "react-router-dom";

import AuthShell from "@components/shared/AuthShell/AuthShell";
import Button from "@components/shared/Button/Button";
import Confetti from "@components/shared/Confetti/Confetti";
import { CheckIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";

import styles from "./WelcomePage.module.scss";

// Post-checkout interstitial between /subscribe and the onboarding wizard —
// Stripe's success_url lands here (see create-subscription-checkout), not
// straight on /admin. SubscriptionGate still owns the ?subscribed=true
// webhook-verification wait upstream of this page, so by the time this
// renders practiceSettings is already confirmed active.
const PLAN_SUMMARY: Record<string, { label: string; desc: string; capacity: string }> = {
  starter: { label: "Starter", desc: "For a small caseload", capacity: "5 active · 5 archived clients" },
  growth: { label: "Growth", desc: "For a growing practice", capacity: "15 active · 15 archived clients" },
  unlimited: { label: "Beyond", desc: "No limit", capacity: "Unlimited clients" },
};

export default function WelcomePage() {
  const navigate = useNavigate();
  const { practiceSettings, loading } = useAuth();

  if (loading || !practiceSettings) return null;

  const plan = PLAN_SUMMARY[practiceSettings.subscription_plan];

  const handleGetStarted = () => {
    navigate(practiceSettings.onboarding_required ? "/admin/setup" : "/admin", { replace: true });
  };

  return (
    <AuthShell tagline="You're all set">
      <div className={styles.burstWrap}>
        <Confetti count={40} />
        <div className={styles.iconBadge}>
          <CheckIcon />
        </div>
      </div>

      <h2 className={styles.heading}>Thank you for subscribing to Clarity</h2>
      <p className={styles.subtext}>Your subscription is active — here's what you're on.</p>

      {plan && (
        <div className={styles.planCard}>
          <span className={styles.planLabel}>{plan.label}</span>
          <span className={styles.planDesc}>{plan.desc}</span>
          <span className={styles.planCapacity}>{plan.capacity}</span>
        </div>
      )}

      <Button onClick={handleGetStarted} className={styles.getStartedBtn}>
        {practiceSettings.onboarding_required ? "Get started" : "Go to dashboard"}
      </Button>
    </AuthShell>
  );
}
