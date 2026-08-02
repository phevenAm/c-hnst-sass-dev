import React, { useState } from "react";
import { Link } from "react-router-dom";

import { LogoIcon, MailIcon } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import { useAuth } from "@context/AuthContext";

import styles from "./SignUpPage.module.scss";

const FIELDS = [
  { id: "firstName", label: "First name", type: "text", ph: "" },
  { id: "lastName", label: "Last name", type: "text", ph: "" },
  { id: "email", label: "Email address", type: "email", ph: "you@example.com" },
  { id: "dob", label: "Date of birth", type: "date", ph: "" },
  {
    id: "accessToken",
    label: "Access token",
    type: "text",
    ph: "Enter the token from your practitioner",
  },
  { id: "password", label: "Password", type: "password", ph: "••••••••" },
  {
    id: "confirm",
    label: "Confirm password",
    type: "password",
    ph: "••••••••",
  },
] as const;

type FieldId = (typeof FIELDS)[number]["id"];

const getAutoComplete = (id: FieldId): string | undefined => {
  if (id === "email") return "email";
  if (id === "password" || id === "confirm") return "new-password";
  return undefined;
};

export default function SignUpPage() {
  const { signUp } = useAuth();
  const [form, setForm] = useState<Record<FieldId, string>>({
    firstName: "",
    lastName: "",
    email: "",
    dob: "",
    accessToken: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (id: FieldId, value: string) => setForm((current) => ({ ...current, [id]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.accessToken.trim()) {
      setError("Access token is required");
      return;
    }

    if (!form.dob) {
      setError("Date of birth is required");
      return;
    }

    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      await signUp(
        form.email,
        form.password,
        {
          first_name: form.firstName,
          last_name: form.lastName,
          dob: form.dob,
        },
        form.accessToken,
      );
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (done)
    return (
      <main className={styles.confirmPage}>
        <div className={styles.confirmBox}>
          <div className={styles.confirmIconWrap}>
            <MailIcon />
          </div>
          <h2 className={styles.confirmTitle}>Check your email</h2>
          <p className={styles.confirmText}>
            We've sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account, then
            come back to sign in. Check your spam folder if you don't see it within a few minutes.
          </p>
          <Link to="/login" className={styles.backLink}>
            ← Back to sign in
          </Link>
        </div>
      </main>
    );

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
            <LogoIcon />
          </div>
          <h1 className={styles.logoTitle}>WithMe</h1>
          <p className={styles.logoSub}>Create your account</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.heading}>Get started</h2>

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {FIELDS.map((field) => (
              <div key={field.id} className={styles.field}>
                <label htmlFor={field.id} className={styles.label}>
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type={field.type}
                  value={form[field.id]}
                  onChange={(e) => set(field.id, e.target.value)}
                  placeholder={field.ph}
                  required
                  autoComplete={getAutoComplete(field.id)}
                  {...(field.type === "date" && {
                    max: new Date().toISOString().split("T")[0],
                  })}
                  className={styles.input}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading || !form.email || !form.dob || !form.password || !form.confirm || !form.accessToken}
              className={styles.submitBtn}
            >
              {loading ? "Creating account…" : "Create account"}
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
