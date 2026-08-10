import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ClarityLogoMark, MailIcon } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";
import styles from "../SignUpPage/SignUpPage.module.scss";

const FIELDS = [
  { id: "firstName", label: "First name", type: "text" },
  { id: "lastName", label: "Last name", type: "text" },
  { id: "practiceName", label: "Practice name", type: "text" },
  { id: "email", label: "Email address", type: "email" },
  { id: "password", label: "Password", type: "password" },
  { id: "confirm", label: "Confirm password", type: "password" },
] as const;

type FieldId = (typeof FIELDS)[number]["id"];

export default function CounsellorSignupPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

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
            We've sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account — you'll
            then be guided through setting up your subscription.
          </p>
          <p className={styles.confirmHint}>
            Already confirmed your email before?{" "}
            <Link to="/login" className={styles.backLink}>
              Sign in instead →
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
          <div className={styles.logoMark}>
            <ClarityLogoMark size={52} />
          </div>
          <h1 className={styles.logoTitle}>Clarity</h1>
          <p className={styles.logoSub}>Register your practice</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.heading}>Get started</h2>

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {FIELDS.map(({ id, label, type }) => (
              <div key={id} className={styles.field}>
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

            <button
              type="submit"
              disabled={submitting || !agreed || !form.email || !form.password || !form.confirm}
              className={styles.submitBtn}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

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
