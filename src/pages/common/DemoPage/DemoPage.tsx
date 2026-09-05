import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AuthShell from "@components/shared/AuthShell/AuthShell";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";

import styles from "./DemoPage.module.scss";

export default function DemoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, loading, isAuthenticated, isAdmin } = useAuth();

  const forParam = searchParams.get("for");
  const [access, setAccess] = useState<"checking" | "granted" | "denied">(forParam ? "checking" : "denied");
  const [submitting, setSubmitting] = useState(false);
  const [signInError, setSignInError] = useState("");

  const [email, setEmail] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState("");

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(isAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [loading, isAuthenticated, isAdmin, navigate]);

  useEffect(() => {
    if (!forParam) {
      setAccess("denied");
      return;
    }
    supabase.rpc("check_demo_access", { p_for: forParam }).then(({ data }) => {
      setAccess(data ? "granted" : "denied");
    });
  }, [forParam]);

  const handleDemoSignIn = async (role: "admin" | "client" | "agency") => {
    setSubmitting(true);
    setSignInError("");
    try {
      const credentials = {
        admin: ["demo-admin@honest.com", "DemoAdmin2026"],
        client: ["demo-client@honest.com", "DemoClient2026"],
        agency: ["demo-agency@honest.com", "DemoAgency2026"],
      }[role];
      await signIn(credentials[0], credentials[1]);
      // No explicit navigate for "agency" — the demo account has
      // counselling_enabled=false, so AgencyGate (Router.tsx) redirects
      // /admin -> /agency on its own, the same path a real manage-only
      // agency owner takes. Racing an extra navigate() here against the
      // isAuthenticated effect above would be a coin flip on which wins.
    } catch {
      setSignInError("Couldn't start the demo — try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setRequestError("");
    try {
      const { error: fnError } = await supabase.functions.invoke("request-demo", { body: { email } });
      if (fnError) throw new Error(fnError.message);
      setRequestSent(true);
    } catch (err: unknown) {
      setRequestError(err instanceof Error ? err.message : "Something went wrong — try again.");
    }
    setSubmitting(false);
  };

  return (
    <AuthShell tagline="A safe space for your journey" photo={false}>
      {access === "checking" && <h2 className={styles.heading}>Checking your link…</h2>}

      {access === "granted" && (
        <>
          <h2 className={styles.heading}>Try Clarity</h2>
          <p className={styles.subheading}>Pick a view below — no account needed.</p>

          {signInError && (
            <div role="alert" className={styles.error}>
              {signInError}
            </div>
          )}

          <div className={styles.demoCards}>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("admin")}
              disabled={submitting}
            >
              <span className={styles.demoRole}>Therapist view</span>
              <span className={styles.demoDesc}>Manage clients, sessions &amp; check-ins</span>
            </button>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("client")}
              disabled={submitting}
            >
              <span className={styles.demoRole}>Client view</span>
              <span className={styles.demoDesc}>Complete check-ins &amp; view resources</span>
            </button>
            <button
              type="button"
              className={styles.demoCard}
              onClick={() => handleDemoSignIn("agency")}
              disabled={submitting}
            >
              <span className={styles.demoRole}>Agency view</span>
              <span className={styles.demoDesc}>Manage staff, waiting list &amp; agency invoices</span>
            </button>
          </div>

          <hr className={styles.divider} />

          <div className={styles.ctaRow}>
            <Link to="/register" className={styles.submitBtn} style={{ textAlign: "center" }}>
              Register your practice
            </Link>
            <a href="mailto:hello@withclarity.uk" className="link">
              Have questions? Email us
            </a>
          </div>
        </>
      )}

      {access === "denied" &&
        (requestSent ? (
          <div className={styles.successBox}>
            <h2 className={styles.heading}>Check your inbox</h2>
            <p className={styles.subheading}>
              We've sent a demo link to {email}. Click it to try Clarity as a therapist or a client.
            </p>
          </div>
        ) : (
          <>
            <h2 className={styles.heading}>Request a demo</h2>
            <p className={styles.subheading}>
              Enter your email and we'll send you a link to try Clarity — no account needed.
            </p>

            {requestError && (
              <div role="alert" className={styles.error}>
                {requestError}
              </div>
            )}

            <form onSubmit={handleRequestDemo} noValidate>
              <div className={styles.field}>
                <label htmlFor="demo-email" className={styles.label}>
                  Email address
                </label>
                <input
                  id="demo-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={styles.input}
                />
              </div>
              <button type="submit" disabled={submitting || !email} className={styles.submitBtn}>
                {submitting ? "Sending…" : "Send me a demo link"}
              </button>
            </form>

            <p className={styles.footer}>
              Already have an account?{" "}
              <Link to="/login" className="link">
                Sign in
              </Link>
            </p>
          </>
        ))}
    </AuthShell>
  );
}
