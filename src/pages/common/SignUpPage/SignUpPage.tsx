import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import AuthShell from "@components/shared/AuthShell/AuthShell";
import InfoTooltip from "@components/shared/InfoTooltip/InfoTooltip";
import PasswordInput from "@components/shared/PasswordInput/PasswordInput";
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

// These fields render side-by-side; all others span full width
const HALF_WIDTH = new Set<FieldId>(["firstName", "lastName", "dob", "accessToken"]);

const getAutoComplete = (id: FieldId): string | undefined => {
  if (id === "email") return "email";
  if (id === "password" || id === "confirm") return "new-password";
  return undefined;
};

export default function SignUpPage() {
  const { signUp, loading: authLoading, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(isAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isAdmin, navigate]);
  const [form, setForm] = useState<Record<FieldId, string>>({
    firstName: "",
    lastName: "",
    email: searchParams.get("email") ?? "",
    dob: "",
    accessToken: searchParams.get("token") ?? "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell tagline="Create your account" wide photo={false} trustBadges>
      <h2 className={styles.heading}>Get started</h2>

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formGrid}>
          {FIELDS.map((field) => (
            <div key={field.id} className={`${styles.field} ${HALF_WIDTH.has(field.id) ? "" : styles.fieldFull}`}>
              <label
                htmlFor={field.id}
                className={styles.label}
                style={field.id === "dob" ? { display: "flex", alignItems: "center", gap: "6px" } : undefined}
              >
                {field.label}
                {field.id === "dob" && (
                  <InfoTooltip
                    variant="rich"
                    trigger="click"
                    title="Why we ask for your date of birth"
                    text={
                      "Your date of birth is only used to work out your age. That lets your counsellor's resource " +
                      "library automatically show you age-appropriate material and hold back anything they've " +
                      "marked as suitable for adults only.\n\nIt isn't shown to other clients, and your counsellor " +
                      "chooses whether to display it on your profile."
                    }
                  />
                )}
              </label>
              {field.type === "password" ? (
                <PasswordInput
                  id={field.id}
                  value={form[field.id]}
                  onChange={(e) => set(field.id, e.target.value)}
                  placeholder={field.ph}
                  required
                  autoComplete={getAutoComplete(field.id)}
                  className={styles.input}
                />
              ) : (
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
              )}
            </div>
          ))}
        </div>

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
        <Link to="/login" className="link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
