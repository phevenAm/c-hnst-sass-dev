import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { LeafLogoMark, MailIcon } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import { useAuth } from "@context/AuthContext";

import { captureReferralCode } from "@/Helpers/referral";
import { stashPendingAgencyInvite } from "@/Hooks/useAgencyBootstrap";
import { supabase } from "@/lib/supabase";
import styles from "../SignUpPage/SignUpPage.module.scss";

type AgencyInvite = { token: string; agencyName: string; role: string; email: string };

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
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get("agency_invite");

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Record<FieldId, string>>({
    firstName: "",
    lastName: "",
    practiceName: "",
    email: searchParams.get("email") ?? "",
    password: "",
    confirm: "",
  });
  const [invite, setInvite] = useState<AgencyInvite | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  // An agency invitation skips the "your practice" framing — the person is
  // joining someone else's agency, not registering their own practice.
  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const { data } = await supabase.rpc("validate_agency_invite", { input_token: inviteToken });
      if (data?.valid) {
        setInvite({
          token: inviteToken,
          agencyName: data.agency_name ?? "an agency",
          role: data.role ?? "counsellor",
          email: data.email ?? "",
        });
        if (data.email) setForm((prev) => ({ ...prev, email: data.email }));
      } else {
        setError("This invitation link is invalid or has expired. Ask your agency to send a new one.");
      }
    })();
  }, [inviteToken]);

  const handleResend = async () => {
    setResending(true);
    setResendMessage("");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: form.email });
    setResending(false);
    setResendMessage(
      resendError ? "Couldn't resend right now — please try again shortly." : "Email sent — check your inbox.",
    );
  };

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    // Already signed in and following an invite link — attach and jump to
    // manage mode instead of bouncing to /admin.
    if (inviteToken) {
      supabase.rpc("consume_agency_invite", { input_token: inviteToken }).finally(() => {
        navigate("/agency", { replace: true });
      });
      return;
    }
    navigate("/admin", { replace: true });
  }, [loading, isAuthenticated, navigate, inviteToken]);

  useEffect(() => {
    captureReferralCode(window.location.search);
  }, []);

  const set = (id: FieldId, value: string) => setForm((prev) => ({ ...prev, [id]: value }));

  const step1Valid = form.firstName.trim() && form.lastName.trim() && (invite ? true : form.practiceName.trim());
  const step1Heading = invite ? "Your details" : "About your practice";

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
      // Leave the token where the post-login bootstrap can finish the job even
      // if this signup needs email confirmation first.
      if (invite) stashPendingAgencyInvite(invite.token);

      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: "admin",
            first_name: form.firstName,
            last_name: form.lastName,
            practice_name: invite ? invite.agencyName : form.practiceName,
          },
        },
      });
      if (signUpError) throw signUpError;

      if (invite) {
        // If the project auto-confirms, we can sign in and attach right away.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (!signInError) {
          await supabase.rpc("consume_agency_invite", { input_token: invite.token });
          try {
            localStorage.removeItem("pendingAgencyInvite");
          } catch {
            /* ignore */
          }
          navigate("/agency", { replace: true });
          return;
        }
      }

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
            Didn't get it?{" "}
            <button
              type="button"
              className={styles.backLink}
              onClick={handleResend}
              disabled={resending}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
            >
              {resending ? "Sending…" : "Resend the email"}
            </button>
          </p>
          {resendMessage && <p className={styles.confirmHint}>{resendMessage}</p>}
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
          <LeafLogoMark size={48} />
          <div className={styles.logoText}>
            <h1 className={styles.logoTitle}>Clarity</h1>
            <p className={styles.logoSub}>{invite ? `Join ${invite.agencyName}` : "Register your practice"}</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.stepDots} aria-label={`Step ${step} of 2`}>
            <div className={`${styles.stepDot} ${step >= 1 ? styles.stepDotActive : ""}`} />
            <div className={`${styles.stepDot} ${step >= 2 ? styles.stepDotActive : ""}`} />
          </div>

          <h2 className={styles.heading}>{step === 2 ? "Your account" : step1Heading}</h2>

          {invite && step === 1 && (
            <p className={styles.processNote}>
              You've been invited to join <strong>{invite.agencyName}</strong> as a {invite.role}.
            </p>
          )}

          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleContinue} noValidate>
              <div className={styles.formGrid}>
                {STEP1_FIELDS.filter((f) => !(invite && f.id === "practiceName")).map(({ id, label, type }) => (
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
                      readOnly={!!invite && id === "email"}
                      className={styles.input}
                    />
                  </div>
                ))}
              </div>

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
                  disabled={submitting || !form.email || !form.password || !form.confirm}
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

          {!invite && (
            <p className={styles.footer}>
              Running an agency with several counsellors?{" "}
              <Link to="/register/agency" className={styles.link}>
                Create an agency
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
