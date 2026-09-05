import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AuthShell from "@components/shared/AuthShell/AuthShell";
import Button from "@components/shared/Button/Button";
import { MailIcon } from "@components/shared/Icons/Icons";
import PasswordInput from "@components/shared/PasswordInput/PasswordInput";
import PdfViewer from "@components/shared/PdfViewer/PdfViewer";
import { useAuth } from "@context/AuthContext";

import { captureReferralCode } from "@/Helpers/referral";
import { stashPendingAgencyInvite } from "@/Hooks/useAgencyBootstrap";
import { supabase } from "@/lib/supabase";
import styles from "../SignUpPage/SignUpPage.module.scss";

type AgencyInvite = {
  token: string;
  agencyName: string;
  role: string;
  email: string;
  staffAgreementRequired: boolean;
  agreementText: string | null;
  agreementPdfUrl: string | null;
};

type FieldId = "firstName" | "lastName" | "practiceName" | "email" | "password" | "confirm";
type Step = "details" | "agreement" | "account";

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

  const [step, setStep] = useState<Step>("details");
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

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signedName, setSignedName] = useState("");

  // Made explicit rather than a plain checkbox somewhere: the agency can
  // require its own working agreement, or leave staff free of one entirely.
  const needsAgreement = !!invite?.staffAgreementRequired && !!(invite.agreementText || invite.agreementPdfUrl);
  const canAcceptAgreement = agreementAccepted && signedName.trim().length > 0;

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
          staffAgreementRequired: data.staff_agreement_required ?? false,
          agreementText: data.agreement_text ?? null,
          agreementPdfUrl: data.agreement_pdf_url ?? null,
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
    // manage mode instead of bouncing to /admin. If the agency requires its
    // working agreement, wait for it to be accepted below before consuming.
    if (inviteToken) {
      if (!invite) return; // still validating (or the token is invalid — error is shown instead)
      if (needsAgreement) {
        setStep("agreement");
        return;
      }
      supabase.rpc("consume_agency_invite", { input_token: inviteToken }).finally(() => {
        navigate("/agency", { replace: true });
      });
      return;
    }
    navigate("/admin", { replace: true });
  }, [loading, isAuthenticated, navigate, inviteToken, invite, needsAgreement]);

  const acceptAgreementAndContinue = async () => {
    if (!canAcceptAgreement) return;
    setError("");
    if (isAuthenticated) {
      // Already-signed-in path (see effect above) — consume immediately.
      if (!invite) return;
      setSubmitting(true);
      try {
        await supabase.rpc("consume_agency_invite", {
          input_token: invite.token,
          p_agreement_accepted: true,
          p_signed_name: signedName.trim(),
        });
        navigate("/agency", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't record your acceptance");
        setSubmitting(false);
      }
      return;
    }
    setStep("account");
  };

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
    setStep(needsAgreement ? "agreement" : "account");
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

    if (needsAgreement && !canAcceptAgreement) {
      setError("You need to accept the agency working agreement first.");
      return;
    }

    setSubmitting(true);
    try {
      // Leave the token (and the agreement acceptance) where the post-login
      // bootstrap can finish the job even if this signup needs email
      // confirmation first.
      if (invite) {
        stashPendingAgencyInvite(
          invite.token,
          needsAgreement ? { accepted: agreementAccepted, signedName: signedName.trim() } : undefined,
        );
      }

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
          await supabase.rpc("consume_agency_invite", {
            input_token: invite.token,
            p_agreement_accepted: needsAgreement ? agreementAccepted : false,
            p_signed_name: needsAgreement ? signedName.trim() : null,
          });
          try {
            localStorage.removeItem("pendingAgencyInvite");
            localStorage.removeItem("pendingAgencyInviteAgreement");
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

  const stepNumber = step === "details" ? 1 : step === "agreement" ? 1.5 : 2;

  return (
    <AuthShell tagline={invite ? `Join ${invite.agencyName}` : "Register your practice"} wide>
      <div className={styles.stepDots} aria-label={`Step ${Math.ceil(stepNumber)} of 2`}>
        <div className={`${styles.stepDot} ${stepNumber >= 1 ? styles.stepDotActive : ""}`} />
        <div className={`${styles.stepDot} ${stepNumber >= 2 ? styles.stepDotActive : ""}`} />
      </div>

      <h2 className={styles.heading}>
        {step === "account"
          ? "Your account"
          : step === "agreement"
            ? `${invite?.agencyName} working agreement`
            : step1Heading}
      </h2>

      {invite && step === "details" && (
        <p className={styles.processNote}>
          You've been invited to join <strong>{invite.agencyName}</strong> as a {invite.role}.
        </p>
      )}

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}

      {step === "agreement" && invite ? (
        <div>
          {invite.agreementText && (
            <div className={styles.processNote} style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
              {invite.agreementText}
            </div>
          )}
          {invite.agreementPdfUrl && <PdfViewer url={invite.agreementPdfUrl} title="Agency working agreement" />}

          <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", margin: "1rem 0" }}>
            <input
              type="checkbox"
              checked={agreementAccepted}
              onChange={(e) => setAgreementAccepted(e.target.checked)}
              style={{ marginTop: "0.2rem" }}
            />
            <span>I confirm I have read and agree to {invite.agencyName}'s working agreement</span>
          </label>

          <div className={styles.field}>
            <label htmlFor="agreementSignedName" className={styles.label}>
              Type your full name to sign
            </label>
            <input
              id="agreementSignedName"
              type="text"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              className={styles.input}
              autoComplete="name"
            />
          </div>

          <div className={styles.stepNav}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setStep("details")}
              disabled={isAuthenticated}
            >
              Back
            </button>
            <Button onClick={acceptAgreementAndContinue} disabled={!canAcceptAgreement || submitting}>
              {submitting ? "Saving…" : "Accept and continue"}
            </Button>
          </div>
        </div>
      ) : step === "details" ? (
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
                {type === "password" ? (
                  <PasswordInput
                    id={id}
                    value={form[id]}
                    onChange={(e) => set(id, e.target.value)}
                    required
                    autoComplete="new-password"
                    className={styles.input}
                  />
                ) : (
                  <input
                    id={id}
                    type={type}
                    value={form[id]}
                    onChange={(e) => set(id, e.target.value)}
                    required
                    readOnly={!!invite && id === "email"}
                    className={styles.input}
                  />
                )}
              </div>
            ))}
          </div>

          <div className={styles.stepNav}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => {
                setError("");
                setStep(needsAgreement ? "agreement" : "details");
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
        {step === "account"
          ? "Check your email for a confirmation link — once confirmed, pick a plan."
          : "You'll set up login details on the next step."}
      </p>

      <p className={styles.footer}>
        Already have an account?{" "}
        <Link to="/login" className="link">
          Sign in
        </Link>
      </p>

      {!invite && (
        <p className={styles.footer}>
          Running an agency with several counsellors?{" "}
          <Link to="/register/agency" className="link">
            Create an agency
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
