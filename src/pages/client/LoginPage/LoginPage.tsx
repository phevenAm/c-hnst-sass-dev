import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

import styles from "./LoginPage.module.scss";

const LogoIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22V12" />
    <path d="M12 12C12 7 7 3 2 3c0 5 4 9 10 9z" />
    <path d="M12 12C12 7 17 3 22 3c0 5-4 9-10 9z" />
  </svg>
);

function ResetPasswordForm() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className={styles.card}>
        <h2 className={styles.heading}>Password updated</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          Your password has been changed. If you use note encryption you may need your recovery code to restore access
          to existing notes.
        </p>
        <button type="button" className={styles.submitBtn} onClick={() => navigate("/admin")}>
          Go to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.heading}>Set new password</h2>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="new-pw" className={styles.label}>
            New password
          </label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className={styles.input}
          />
        </div>
        <div className={`${styles.field} ${styles.fieldLast}`}>
          <label htmlFor="confirm-pw" className={styles.label}>
            Confirm password
          </label>
          <input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={styles.input}
          />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={submitting || !newPassword || !confirm}>
          {submitting ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setSubmitting(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <Modal
      title="Reset your password"
      onClose={onClose}
      size="sm"
      actions={
        sent ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={handleSend} disabled={submitting || !email}>
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p>Check your inbox — if that email is registered, you'll receive a reset link shortly.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className={styles.modalForm}
        >
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.field}>
            <label htmlFor="forgot-email" className={styles.label}>
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={styles.input}
            />
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, loading, isAuthenticated, isAdmin, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  // Initialise synchronously so resetMode is true before the navigation guard runs.
  // Implicit-flow recovery: Supabase parses the URL hash before React mounts and fires
  // PASSWORD_RECOVERY into the void — the hash check catches it. The onAuthStateChange
  // listener below catches PKCE-flow recovery (async exchange, fires after mount).
  const [resetMode, setResetMode] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    return hashParams.get("type") === "recovery";
  });

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setResetMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated && !resetMode) {
      navigate(isAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [loading, isAuthenticated, isAdmin, navigate, resetMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoSignIn = async (role: "admin" | "client") => {
    setSubmitting(true);
    try {
      await signIn(
        role === "admin" ? "demo-admin@honest.com" : "demo-client@honest.com",
        role === "admin" ? "DemoAdmin2026" : "DemoClient2026",
      );
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = submitting || loading;

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
          <p className={styles.logoSub}>A safe space for your journey</p>
        </div>

        {resetMode ? <ResetPasswordForm /> : null}

        <div className={styles.card} style={resetMode ? { display: "none" } : undefined}>
          <h2 className={styles.heading}>Welcome back</h2>

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={styles.input}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldLast}`}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={styles.input}
              />
              <button type="button" className={styles.forgotLink} onClick={() => setShowForgotModal(true)}>
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={isLoading || !email || !password} className={styles.submitBtn}>
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className={styles.footer}>
            Don't have an account?{" "}
            <Link to="/signup" className={styles.link}>
              Sign up
            </Link>
          </p>
          <p className={styles.footer}>
            Are you a therapist?{" "}
            <Link to="/register" className={styles.link}>
              Register your practice
            </Link>
          </p>
        </div>

        <div className={styles.demoSection}>
          <p className={styles.demoDivider}>or try a demo account</p>
          <div className={styles.demoCards}>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("admin")}
              disabled={isLoading}
            >
              <span className={styles.demoRole}>Therapist view</span>
              <span className={styles.demoDesc}>Manage clients, sessions &amp; check-ins</span>
            </button>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("client")}
              disabled={isLoading}
            >
              <span className={styles.demoRole}>Client view</span>
              <span className={styles.demoDesc}>Complete check-ins &amp; view resources</span>
            </button>
          </div>
        </div>
      </div>
      {showForgotModal && <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />}
    </main>
  );
}
