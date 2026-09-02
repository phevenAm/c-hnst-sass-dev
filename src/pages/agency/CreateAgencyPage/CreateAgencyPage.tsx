import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { createAgency, selectAgencyMembership } from "@store/slices/agencySlice";

import styles from "./CreateAgencyPage.module.scss";

// Turns the signed-in counsellor into the owner + first manager of a new agency.
// Billing isn't wired yet — this is the DB/UI-first phase.
export default function CreateAgencyPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isAdmin, loading } = useAuth();
  const membership = useAppSelector(selectAgencyMembership);

  const [name, setName] = useState("");
  const [manageOnly, setManageOnly] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Create an agency · Clarity";
  }, []);

  if (!loading && !isAdmin) return <Navigate to="/" replace />;
  if (membership) return <Navigate to="/agency" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await dispatch(createAgency({ name: name.trim(), counselling_enabled: !manageOnly })).unwrap();
      showToast("Agency created — welcome to manage mode.", "success");
      navigate("/agency", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the agency");
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Create an agency</h1>
        <p className={styles.lede}>
          An agency lets you bring several counsellors under one account, assign clients to them, and set shared rules
          for how they work.
        </p>

        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="agencyName">
            Agency name
          </label>
          <input
            id="agencyName"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Meadow Counselling Collective"
            required
          />
        </div>

        <label className={styles.check}>
          <input type="checkbox" checked={manageOnly} onChange={(e) => setManageOnly(e.target.checked)} />
          <span>
            I mainly manage other counsellors and won't see my own clients here. You can change this later in manage
            mode.
          </span>
        </label>

        <Button type="submit" fullWidth disabled={submitting || !name.trim()}>
          {submitting ? "Creating…" : "Create agency"}
        </Button>

        <p className={styles.footNote}>Your existing account and any clients you have stay exactly as they are.</p>
      </form>
    </main>
  );
}
