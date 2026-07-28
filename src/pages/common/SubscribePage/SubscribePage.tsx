import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(0);
  const [agreed, setAgreed] = useState(false);
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
      <div className={`inner ${styles.container}`}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Start your WithMe subscription</h1>
          <p className={styles.price}>£12 / month &mdash; cancel any time</p>
        </header>

        <div className={styles.carousel}>
          <div key={current} className={styles.slide}>
            <div className={styles.slideIcon}>
              <Icon />
            </div>
            <div className={styles.slideBody}>
              <h2 className={styles.slideTitle}>{title}</h2>
              <p className={styles.slideDesc}>{description}</p>
              <ul className={styles.slidePoints}>
                {points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.dots}>
            {SLIDES.map((_, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: stable order, not re-ordered
                key={i}
                type="button"
                className={`${styles.dot} ${i === current ? styles.activeDot : ""}`}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <label className={styles.termsLabel}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I agree to the{" "}
            <Link to="/terms" className={styles.termsLink}>
              Terms &amp; Conditions
            </Link>
          </span>
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <Button onClick={handleSubscribe} disabled={loading || !agreed}>
          {loading ? "Redirecting to payment…" : "Subscribe — £12 / month"}
        </Button>
      </div>
    </div>
  );
}
