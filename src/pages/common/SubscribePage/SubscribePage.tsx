import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import {
  CheckIcon,
  ClarityLogoMark,
  ClipboardIcon,
  LeafLogoMark,
  PaidIcon,
  UsersIcon,
} from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./SubscribePage.module.scss";

const SLIDES = [
  {
    Icon: UsersIcon,
    title: "Your clients, organised",
    description: "Manage client profiles, session history, surveys, and notes — all in one place.",
    points: ["Client profiles and onboarding", "Custom surveys and responses", "Session notes and history"],
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
  { text: "Unlimited clients and sessions", slide: 0 },
  { text: "Card payments via Stripe Connect", slide: 2 },
  { text: "Client check-ins and surveys", slide: 1 },
  { text: "Practice analytics and PDF export", slide: 3 },
];

type Plan = "app";
type Billing = "monthly" | "annual";

const PLANS: Record<Plan, { label: string; monthly: number; annual: number; desc: string }> = {
  app: { label: "App", monthly: 11.99, annual: 119.99, desc: "Practice management" },
};

const TERMS_SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "1. Introduction",
    body: "These Terms & Conditions govern your use of Clarity, operated by Clarity. By registering an account or subscribing, you agree to be bound by these Terms.",
  },
  {
    title: "2. Service description",
    body: "Clarity is a practice management platform for independent counsellors and therapists — managing clients, scheduling, session notes, surveys, payments, and related practice tools, with new features added over time. Provided on a monthly subscription basis.",
  },
  {
    title: "3. Subscription & payment",
    body: "Access requires an active monthly subscription billed in advance via Stripe. You may cancel at any time through Settings; access continues until end of the current billing period. Client payments processed via Stripe Connect go directly to your account — Clarity itself takes no cut, though Stripe's own processing fees apply to card payments.",
  },
  {
    title: "4. Data & privacy",
    body: "You are the data controller for all client data. You are responsible for obtaining appropriate consent from clients and complying with UK GDPR. Clarity acts as data processor on your behalf. If your subscription lapses, data is retained for 12 months before permanent deletion.",
  },
  {
    title: "5. Session notes",
    body: (
      <>
        Clarity supports storing session notes directly in the platform, with optional client-side encryption you can
        enable so the note content is unreadable to anyone without your unlock code, Clarity included. Encryption is
        opt-in and the unlock code is generated only for you — if it's lost, there is no way for us to recover access to
        notes encrypted under it. Whether or not you enable encryption, you remain solely responsible for your own
        professional record-keeping obligations (retention periods, access controls, and identification practices) in
        line with BACP guidance and UK GDPR.
      </>
    ),
  },
  {
    title: "6. Cancellation & account deletion",
    body: "Cancel your subscription at any time via Settings → Manage subscription. Delete your account and all data via Settings → Delete account. Deletion is permanent and cannot be undone.",
  },
  {
    title: "7. Limitation of liability",
    body: "The Platform is provided 'as is'. Clarity excludes all liability for indirect or consequential loss. Total liability in any 12-month period shall not exceed subscription fees paid in that period.",
  },
  {
    title: "8. Governing law",
    body: "These Terms are governed by the laws of England and Wales. Disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.",
  },
];

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { signOut } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>("app");
  const [billing, setBilling] = useState<Billing>("monthly");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      showToast("Checkout cancelled — you can try again any time.", "warning");
    }
  }, [searchParams, showToast]);

  const startAutoAdvance = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % SLIDES.length);
    }, 5000);
  };

  useEffect(() => {
    startAutoAdvance();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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
        body: { plan, billing },
      });

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
                {(Object.entries(PLANS) as [Plan, (typeof PLANS)[Plan]][]).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.planCard} ${plan === key ? styles.planCardActive : ""}`}
                    onClick={() => setPlan(key)}
                  >
                    <span className={styles.planCardName}>{p.label}</span>
                    <span className={styles.planCardPrice}>
                      £{billing === "annual" ? p.annual : p.monthly}
                      <span className={styles.planCardPer}>{billing === "annual" ? "/yr" : "/mo"}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.priceRow}>
                <span className={styles.currency}>£</span>
                <span className={styles.amount}>{displayPrice}</span>
                <span className={styles.period}>{billing === "annual" ? "/ year" : "/ month"}</span>
              </div>

              {billing === "annual" ? (
                <p className={styles.billingNote}>Save £{annualSaving} vs monthly &middot; Cancel any time</p>
              ) : (
                <p className={styles.billingNote}>Billed monthly &middot; Cancel any time</p>
              )}

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
              <p className={styles.modalIntro}>Last updated: August 2026. Please read carefully before subscribing.</p>

              <div className={styles.purposeBox}>
                <strong>Clarity is a practice management platform</strong> for independent counsellors and therapists —
                clients, scheduling, session notes, surveys, and payments, with more added over time. Session notes
                support <strong>optional client-side encryption</strong> you control, but you remain responsible for
                meeting your own professional record-keeping obligations.
              </div>

              {TERMS_SECTIONS.map(({ title: st, body }) => (
                <div key={st} className={styles.termSection}>
                  <h3>{st}</h3>
                  <p>{body}</p>
                </div>
              ))}
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
