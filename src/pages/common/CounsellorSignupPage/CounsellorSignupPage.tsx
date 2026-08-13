import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { LeafLottieLogoMark, MailIcon } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";
import styles from "../SignUpPage/SignUpPage.module.scss";

type FieldId = "firstName" | "lastName" | "practiceName" | "email" | "password" | "confirm";

const STEP1_FIELDS: { id: FieldId; label: string; type: string }[] = [
  { id: "firstName", label: "First name", type: "text" },
  { id: "lastName", label: "Last name", type: "text" },
  { id: "practiceName", label: "Practice name", type: "text" },
];

const STEP2_FIELDS: { id: FieldId; label: string; type: string }[] = [
  { id: "email", label: "Email address", type: "email" },
  { id: "password", label: "Password", type: "password" },
  { id: "confirm", label: "Confirm password", type: "password" },
];

export default function CounsellorSignupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Record<FieldId, string>>({
    firstName: "",
    lastName: "",
    practiceName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/admin", { replace: true });
  }, [loading, isAuthenticated, navigate]);

  const set = (id: FieldId, value: string) => setForm((prev) => ({ ...prev, [id]: value }));

  const step1Valid = form.firstName.trim() && form.lastName.trim() && form.practiceName.trim();

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!step1Valid) return;
    setError("");
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: "admin",
            first_name: form.firstName,
            last_name: form.lastName,
            practice_name: form.practiceName,
          },
        },
      });
      if (signUpError) throw signUpError;
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className={styles.confirmPage}>
        <div className={styles.confirmBox}>
          <div className={styles.confirmIconWrap}>
            <MailIcon />
          </div>
          <h2 className={styles.confirmTitle}>Check your email</h2>
          <p className={styles.confirmText}>
            We've sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.
          </p>
          <p className={styles.confirmText}>
            Once confirmed, sign in and you'll be guided through setting up your subscription to complete your
            registration.
          </p>
          <p className={styles.confirmHint}>
            Already confirmed your email?{" "}
            <Link to="/login" className={styles.backLink}>
              Sign in to continue →
            </Link>
          </p>
          <Link to="/login" className={styles.backLink}>
            ← Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={`${styles.page} page`}>
      <ImageBlurBlock
        imageUrl="/pexels-amirali-shaghaghi-18428647.jpg"
        photographer="Amirali Shaghaghi"
        sourceLabel="Pexels"
        creditUrl="https://www.pexels.com/@amirali-shaghaghi-479660570/"
      />
      <div className={`${styles.container} container`}>
        <div className={styles.logoWrap}>
          <LeafLottieLogoMark size={48} />
          <div className={styles.logoText}>
            <h1 className={styles.logoTitle}>Clarity</h1>
            <p className={styles.logoSub}>Register your practice</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.stepDots} aria-label={`Step ${step} of 2`}>
            <div className={`${styles.stepDot} ${step >= 1 ? styles.stepDotActive : ""}`} />
            <div className={`${styles.stepDot} ${step >= 2 ? styles.stepDotActive : ""}`} />
          </div>

          <h2 className={styles.heading}>{step === 1 ? "About your practice" : "Your account"}</h2>

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleContinue} noValidate>
              <div className={styles.formGrid}>
                {STEP1_FIELDS.map(({ id, label, type }) => (
                  <div
                    key={id}
                    className={`${styles.field} ${id === "firstName" || id === "lastName" ? "" : styles.fieldFull}`}
                  >
                    <label htmlFor={id} className={styles.label}>
                      {label}
                    </label>
                    <input
                      id={id}
                      type={type}
                      value={form[id]}
                      onChange={(e) => set(id, e.target.value)}
                      required
                      className={styles.input}
                    />
                  </div>
                ))}
              </div>

              <button type="submit" disabled={!step1Valid} className={styles.submitBtn}>
                Continue
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.formGrid}>
                {STEP2_FIELDS.map(({ id, label, type }) => (
                  <div key={id} className={`${styles.field} ${styles.fieldFull}`}>
                    <label htmlFor={id} className={styles.label}>
                      {label}
                    </label>
                    <input
                      id={id}
                      type={type}
                      value={form[id]}
                      onChange={(e) => set(id, e.target.value)}
                      required
                      className={styles.input}
                    />
                  </div>
                ))}
              </div>

              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <Link to="/terms" className={styles.link}>
                    Terms &amp; Conditions
                  </Link>
                </span>
              </label>

              <div className={styles.stepNav}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => {
                    setError("");
                    setStep(1);
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting || !agreed || !form.email || !form.password || !form.confirm}
                  className={styles.stepSubmitBtn}
                >
                  {submitting ? "Creating account…" : "Create account"}
                </button>
              </div>
            </form>
          )}

          <p className={styles.processNote}>
            {step === 1
              ? "You'll set up login details on the next step."
              : "Check your email for a confirmation link — once confirmed, pick a plan."}
          </p>

          <p className={styles.footer}>
            Already have an account?{" "}
            <Link to="/login" className={styles.link}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
