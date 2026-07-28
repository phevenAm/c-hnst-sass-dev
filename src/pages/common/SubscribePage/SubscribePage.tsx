import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { CheckIcon, ClipboardIcon, PaidIcon, UsersIcon } from "@components/shared/Icons/Icons";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./SubscribePage.module.scss";

const SLIDES = [
  {
    Icon: UsersIcon,
    title: "Your clients, organised",
    description: "Manage client profiles, session history, questionnaires, and notes — all in one place.",
    points: ["Client profiles and onboarding", "Custom questionnaires and responses", "Session notes and history"],
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
      "No platform cut on client payments",
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
  { text: "Client check-ins and questionnaires", slide: 1 },
  { text: "Practice analytics and PDF export", slide: 3 },
];

const TERMS_SECTIONS = [
  {
    title: "1. Introduction",
    body: "These Terms & Conditions govern your use of WithMe, operated by WithMe. By registering an account or subscribing, you agree to be bound by these Terms.",
  },
  {
    title: "2. Service description",
    body: "WithMe is a practice management platform for independent counsellors and therapists — managing clients, sessions, questionnaires, and payments. Provided on a monthly subscription basis.",
  },
  {
    title: "3. Subscription & payment",
    body: "Access requires an active monthly subscription billed in advance via Stripe. You may cancel at any time through Settings; access continues until end of the current billing period. Client payments processed via Stripe Connect go directly to your account — WithMe takes no cut.",
  },
  {
    title: "4. Data & privacy",
    body: "You are the data controller for all client data. You are responsible for obtaining appropriate consent from clients and complying with UK GDPR. WithMe acts as data processor on your behalf. If your subscription lapses, data is retained for 12 months before permanent deletion.",
  },
  {
    title: "5. Acceptable use",
    body: "You must not use the Platform for any unlawful purpose or in a way that could harm WithMe or any third party. You are responsible for maintaining the confidentiality of your credentials.",
  },
  {
    title: "6. Cancellation & account deletion",
    body: "Cancel your subscription at any time via Settings → Manage subscription. Delete your account and all data via Settings → Delete account. Deletion is permanent and cannot be undone.",
  },
  {
    title: "7. Limitation of liability",
    body: "The Platform is provided 'as is'. WithMe excludes all liability for indirect or consequential loss. Total liability in any 12-month period shall not exceed subscription fees paid in that period.",
  },
  {
    title: "8. Governing law",
    body: "These Terms are governed by the laws of England and Wales. Disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.",
  },
];

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      showToast("Checkout cancelled — you can try again any time.", "warning");
    }
  }, []);

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
      const { data, error: fnError } = await supabase.functions.invoke("create-subscription-checkout");
      if (fnError) throw new Error(fnError.message);
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const { Icon, title, description, points } = SLIDES[current];

  return (
    <div className="page">
      <div className={`inner ${styles.wrapper}`}>
        <div className={styles.grid}>
          {/* ── Left: feature carousel ── */}
          <div className={styles.left}>
            <p className={styles.eyebrow}>Practice management</p>
            <h1 className={styles.heading}>Everything you need to run your practice</h1>

            <div className={styles.carousel}>
              <div key={current} className={styles.slide}>
                <div className={styles.slideIconWrap}>
                  <Icon />
                </div>
                <h2 className={styles.slideTitle}>{title}</h2>
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

          {/* ── Right: pricing card ── */}
          <div className={styles.right}>
            <div className={styles.pricingCard}>
              <p className={styles.planLabel}>WithMe Practice</p>

              <div className={styles.priceRow}>
                <span className={styles.currency}>£</span>
                <span className={styles.amount}>12</span>
                <span className={styles.period}>/ month</span>
              </div>
              <p className={styles.billingNote}>Billed monthly &middot; Cancel any time</p>

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
                <p className={styles.agreedNote}>Terms accepted</p>
              ) : (
                <button type="button" className={styles.termsBtn} onClick={() => setTermsOpen(true)}>
                  Read &amp; accept Terms &amp; Conditions
                </button>
              )}

              {error && <p className={styles.error}>{error}</p>}

              <Button onClick={handleSubscribe} disabled={loading || !agreed} className={styles.subscribeBtn}>
                {loading ? "Redirecting to payment…" : "Start subscription"}
              </Button>

              <p className={styles.secureNote}>Secure payment via Stripe</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── T&Cs modal ── */}
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
              <p className={styles.modalIntro}>Last updated: July 2026. Please read carefully before subscribing.</p>
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
    </div>
  );
}
