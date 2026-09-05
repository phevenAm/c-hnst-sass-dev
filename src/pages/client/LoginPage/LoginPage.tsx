import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import AuthShell from "@components/shared/AuthShell/AuthShell";
import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import PasswordInput from "@components/shared/PasswordInput/PasswordInput";
import { useAuth } from "@context/AuthContext";

import { clearPersistedAuthSession, supabase } from "@/lib/supabase";

import styles from "./LoginPage.module.scss";

function ResetPasswordForm() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
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
      <>
        <h2 className={styles.heading}>Password updated</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          Your password has been changed. If note encryption is set up, use your 4-word encryption code to re-link
          access to your notes next time you open them.
        </p>
        <button type="button" className={styles.submitBtn} onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}>
          Go to dashboard
        </button>
      </>
    );
  }

  return (
    <>
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
          <PasswordInput
            id="new-pw"
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
          <PasswordInput
            id="confirm-pw"
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
    </>
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
      // ?type=recovery lets LoginPage detect the mode synchronously on mount,
      // preventing the navigation guard from redirecting before PASSWORD_RECOVERY fires.
      redirectTo: `${window.location.origin}/login?type=recovery`,
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
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSend} disabled={submitting || !email}>
              {submitting ? "Sending…" : "Send reset link"}
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
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  // Initialise synchronously so resetMode is true before the navigation guard runs.
  // Implicit-flow recovery: Supabase parses the URL hash before React mounts and fires
  // PASSWORD_RECOVERY into the void — the hash check catches it. The onAuthStateChange
  // listener below catches PKCE-flow recovery (async exchange, fires after mount).
  const [resetMode, setResetMode] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    return hashParams.get("type") === "recovery" || queryParams.get("type") === "recovery";
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
      // Supabase always persists to localStorage — "remember me" off just
      // means this device forgets on tab close instead of staying signed in
      // indefinitely. Runs once per successful sign-in, not once per tab.
      if (!rememberMe) {
        window.addEventListener("beforeunload", clearPersistedAuthSession, { once: true });
      }
    } catch {
      // error is set in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = submitting || loading;

  // Coming in from the marketing site's "Log in" link: hold on the logo splash
  // while the initial session check runs, so an already-signed-in visitor is
  // redirected straight through (see the effect above) instead of seeing the
  // login form flash first.
  if (loading && !resetMode) {
    return <AuthLoadingState variant="splash" />;
  }

  return (
    <>
      <AuthShell
        tagline="A safe space for your journey"
        photo={false}
        trustBadges={!resetMode}
        footer={
          resetMode ? undefined : (
            <>
              Curious to explore first?{" "}
              <Link to="/demo" className="link">
                Take a quick tour
              </Link>
            </>
          )
        }
      >
        {resetMode ? (
          <ResetPasswordForm />
        ) : (
          <>
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
                <PasswordInput
                  id="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={styles.input}
                />
              </div>

              <div className={styles.rememberRow}>
                <label className={styles.rememberLabel}>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Remember me
                </label>
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
              <Link to="/signup" className="link">
                Sign up
              </Link>
            </p>
            <p className={styles.footer}>
              Are you a therapist?{" "}
              <Link to="/register" className="link">
                Register your practice
              </Link>
            </p>
          </>
        )}
      </AuthShell>
      {showForgotModal && <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />}
    </>
  );
}
