import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { CheckIcon, ClipboardIcon, LeafLogoMark, PaidIcon, UsersIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { captureReferralCode, getReferralCode } from "@/Helpers/referral";
import { supabase } from "@/lib/supabase";

import styles from "./SubscribePage.module.scss";

const SLIDES = [
  {
    Icon: UsersIcon,
    title: "Your clients, organised",
    description: "Manage client profiles, session history, surveys, and notes — all in one place.",
    points: [
      "Client profiles and onboarding",
      "Custom surveys and responses",
      "Session notes with optional end-to-end encryption",
    ],
  },
  {
    Icon: ClipboardIcon,
    title: "Sessions made simple",
    description: "Schedule appointments, track attendance, and stay on top of your caseload effortlessly.",
    points: ["Book and reschedule sessions", "Real-time session status updates", "Calendar and schedule views"],
  },
  {
    Icon: PaidIcon,
    title: "Payments that just work",
    description: "Accept bank transfers or Stripe card payments. Money goes directly to your account.",
    points: [
      "Bank transfer details shown to clients",
      "Stripe card payments via Connect",
      "No platform cut — just Stripe's standard fee",
    ],
  },
  {
    Icon: CheckIcon,
    title: "Real-time practice dashboard",
    description: "See your whole practice at a glance — sessions, check-ins, and outstanding items.",
    points: ["Upcoming sessions and schedule", "Client check-in tracking", "Analytics, PDF reports, and export"],
  },
];

const PRICING_FEATURES = [
  { text: "Every feature on every plan", slide: 0 },
  { text: "Card payments via Stripe Connect", slide: 2 },
  { text: "Client check-ins and surveys", slide: 1 },
  { text: "Practice analytics and PDF export", slide: 3 },
];

type Plan = "starter" | "growth" | "unlimited";
type Billing = "monthly" | "annual";

// £ figures mirror the marketing page (index.html TIERS) and the Stripe
// products. Client caps are enforced server-side from the plan_limits table.
const PLANS: Record<Plan, { label: string; monthly: number; annual: number; desc: string; capacity: string }> = {
  starter: {
    label: "Starter",
    monthly: 7.99,
    annual: 79,
    desc: "For a small caseload",
    capacity: "5 active · 5 archived",
  },
  growth: {
    label: "Growth",
    monthly: 13.99,
    annual: 139,
    desc: "For a growing practice",
    capacity: "15 active · 15 archived",
  },
  unlimited: {
    label: "Unlimited",
    monthly: 19.99,
    annual: 199,
    desc: "No limit",
    capacity: "Unlimited clients",
  },
};
const PLAN_ORDER: Plan[] = ["starter", "growth", "unlimited"];

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { signOut } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>("starter");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      showToast("Checkout cancelled — you can try again any time.", "warning");
    }
  }, [searchParams, showToast]);

  // Normally captured earlier, on /register — this is a fallback for anyone
  // who lands straight on /subscribe with the ?ref= param (e.g. a link
  // shared for an existing-account edge case, or opening it directly).
  useEffect(() => {
    captureReferralCode(window.location.search);
    setReferralCode(getReferralCode());
  }, []);

  // useCallback keeps this stable across renders — a plain function here
  // would be a new reference on every slide advance (setCurrent below
  // triggers a re-render), which as an effect dependency would tear down
  // and restart the interval on every tick instead of just running once.
  const startAutoAdvance = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, 5000);
  }, []);

  useEffect(() => {
    startAutoAdvance();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startAutoAdvance]);

  const goTo = (index: number) => {
    setCurrent(index);
    startAutoAdvance();
  };

  const handleAgree = () => {
    setAgreed(true);
    setTermsOpen(false);
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-subscription-checkout", {
        body: { plan, billing, ...(referralCode ? { referral_code: referralCode } : {}) },
      });

      console.log(data)

      if (fnError) throw new Error(fnError.message);
      if (!data?.url) throw new Error("No checkout URL returned");

      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const selectedPlan = PLANS[plan];
  const displayPrice = billing === "annual" ? selectedPlan.annual : selectedPlan.monthly;
  const annualSaving = selectedPlan.monthly * 12 - selectedPlan.annual;

  const { Icon, title, description, points } = SLIDES[current];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>
            <LeafLogoMark />
          </div>
          <h1 className={styles.logoTitle}>Clarity</h1>
          <p className={styles.logoSub}>Start your subscription</p>
        </div>

        <div className={styles.card}>
          <div className={styles.grid}>
            <div className={styles.left}>
              <p className={styles.eyebrow}>Practice management</p>
              <h2 className={styles.heading}>Everything you need to run your practice</h2>

              <div className={styles.carousel}>
                <div key={current} className={styles.slide}>
                  <div className={styles.slideIconWrap}>
                    <Icon />
                  </div>
                  <h3 className={styles.slideTitle}>{title}</h3>
                  <p className={styles.slideDesc}>{description}</p>

                  <ul className={styles.slidePoints}>
                    {points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.dots}>
                  {SLIDES.map((s, i) => (
                    <button
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                      key={i}
                      type="button"
                      className={`${styles.dot} ${i === current ? styles.activeDot : ""}`}
                      onClick={() => goTo(i)}
                      aria-label={s.title}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.right}>
              <div className={styles.billingToggle}>
                <button
                  type="button"
                  className={`${styles.billingBtn} ${billing === "monthly" ? styles.billingBtnActive : ""}`}
                  onClick={() => setBilling("monthly")}
                >
                  Monthly
                </button>

                <button
                  type="button"
                  className={`${styles.billingBtn} ${billing === "annual" ? styles.billingBtnActive : ""}`}
                  onClick={() => setBilling("annual")}
                >
                  <span className={styles.billingBtnStack}>
                    Annual
                    <span className={styles.billingBtnSave}>2 months free</span>
                  </span>
                </button>
              </div>

              <div className={styles.planCards}>
                {PLAN_ORDER.map((key) => {
                  const p = PLANS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.planCard} ${plan === key ? styles.planCardActive : ""}`}
                      onClick={() => setPlan(key)}
                    >
                      <span className={styles.planCardMain}>
                        <span className={styles.planCardName}>{p.label}</span>
                        <span className={styles.planCardSub}>{p.capacity}</span>
                      </span>
                      <span className={styles.planCardPrice}>
                        £{billing === "annual" ? p.annual : p.monthly}
                        <span className={styles.planCardPer}>{billing === "annual" ? "/yr" : "/mo"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.priceRow}>
                <span className={styles.currency}>£</span>
                <span className={styles.amount}>{displayPrice}</span>
                <span className={styles.period}>{billing === "annual" ? "/ year" : "/ month"}</span>
              </div>

              {billing === "annual" ? (
                <p className={styles.billingNote}>
                  Save £{annualSaving.toFixed(2)} vs monthly &middot; Cancel any time
                </p>
              ) : (
                <p className={styles.billingNote}>Billed monthly &middot; Cancel any time</p>
              )}
              <p className={styles.billingNote}>
                You're only charged for active clients — archive the same number again at no extra cost.
              </p>

              <hr className={styles.divider} />

              <ul className={styles.featureList}>
                {PRICING_FEATURES.map(({ text, slide: slideIdx }) => (
                  <li key={text}>
                    <button
                      type="button"
                      className={`${styles.featureBtn} ${slideIdx === current ? styles.featureBtnActive : ""}`}
                      onClick={() => goTo(slideIdx)}
                    >
                      {text}
                    </button>
                  </li>
                ))}
              </ul>

              <hr className={styles.divider} />

              {agreed ? (
                <div className={styles.agreedBadge}>
                  <span>✓</span> Terms &amp; Conditions accepted
                </div>
              ) : (
                <button type="button" className={styles.termsBtn} onClick={() => setTermsOpen(true)}>
                  <span className={styles.termsBtnLeft}>
                    <span className={styles.termsBtnStep}>Required</span>
                    <span className={styles.termsBtnLabel}>Read &amp; accept Terms &amp; Conditions</span>
                  </span>
                  <span className={styles.termsBtnArrow}>→</span>
                </button>
              )}

              {error && <p className={styles.error}>{error}</p>}

              {referralCode && (
                <p className={styles.billingNote}>Referred by a colleague — their code will be applied.</p>
              )}

              <Button onClick={handleSubscribe} disabled={loading || !agreed} className={styles.subscribeBtn}>
                {loading ? "Redirecting to payment…" : "Start subscription"}
              </Button>

              <p className={styles.secureNote}>🔒 Secure payment via Stripe</p>
            </div>
          </div>
        </div>

        <p className={styles.footer}>
          Wrong account?{" "}
          <button type="button" className={styles.signOutLink} onClick={signOut}>
            Sign out
          </button>
        </p>
      </div>

      {termsOpen && (
        <div className={styles.backdrop} onClick={() => setTermsOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Terms &amp; Conditions</h2>

              <button type="button" className={styles.modalClose} onClick={() => setTermsOpen(false)}>
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalIntro}>Last updated: 6 September 2026. Please read the complete documents before subscribing.</p>

              <div className={styles.purposeBox}>
                <strong>Clarity is a practice management platform</strong> for independent counsellors and therapists.
                It currently provides client records, scheduling, session notes, forms, communications, exports, and
                payment features. It is software, not a healthcare provider, emergency service, or substitute for
                professional judgement.
              </div>

              <div className={styles.termSection}>
                <h3>What you are agreeing to</h3>
                <p>
                  You are responsible for your practice, the client data you enter, lawful processing, professional
                  records, and checking that Clarity is suitable for your work. Subscription pricing, cancellation,
                  plan changes, pausing, deletion, support, and data responsibilities are set out in the full Terms of
                  Service and Privacy Policy.
                </p>
                <p>
                  <a href="/terms" target="_blank" rel="noreferrer">
                    Read the full Terms of Service
                  </a>
                  <br />
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    Read the Privacy Policy
                  </a>
                </p>
                <p>
                  A separate Data Processing Agreement is not currently published. Do not upload client data at scale
                  until that agreement and the operator details on the legal pages have been completed and reviewed.
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <Button onClick={handleAgree} className={styles.agreeBtn}>
                I agree — continue to payment
              </Button>

              <button type="button" className={styles.declineBtn} onClick={() => setTermsOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
