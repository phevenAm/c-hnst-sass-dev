import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { useToast } from "@context/ToastContext";
import type { Agency } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectAgency, selectIsAgencyManager, updateAgencyPolicies } from "@store/slices/agencySlice";

import styles from "../agency.module.scss";

type PolicyKey = "shared_resources" | "require_note_encryption" | "locked_email_templates" | "locked_consent";

const POLICIES: { key: PolicyKey; title: string; blurb: string }[] = [
  {
    key: "locked_consent",
    title: "Agency consent wording",
    blurb: "Members use the agency's client-consent text below instead of setting their own.",
  },
  {
    key: "shared_resources",
    title: "Shared resource library",
    blurb: "Resources added by the agency appear for every member's clients.",
  },
  {
    key: "require_note_encryption",
    title: "Require note encryption",
    blurb: "Members must switch on client-side encryption before writing session notes.",
  },
  {
    key: "locked_email_templates",
    title: "Lock client email wording",
    blurb: "Members can't edit the automated client emails or their on/off switches.",
  },
];

export default function AgencySettingsPage() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);

  const [draft, setDraft] = useState<Agency | null>(agency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(agency);
  }, [agency]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;
  if (!draft) return <p className={styles.empty}>Loading…</p>;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await dispatch(
        updateAgencyPolicies({
          id: draft.id,
          name: draft.name.trim(),
          locked_consent: draft.locked_consent,
          consent_text: draft.consent_text,
          shared_resources: draft.shared_resources,
          require_note_encryption: draft.require_note_encryption,
          locked_email_templates: draft.locked_email_templates,
        }),
      ).unwrap();
      showToast("Agency settings saved.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>Your agency's name and the rules that apply to every member.</p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field} style={{ maxWidth: 380, marginBottom: "var(--sp-6)" }}>
        <label className={styles.label} htmlFor="ag-name">
          Agency name
        </label>
        <input
          id="ag-name"
          className={styles.input}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div>
        {POLICIES.map((p) => (
          <div key={p.key} className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <strong>{p.title}</strong>
              <span>{p.blurb}</span>
              {p.key === "locked_consent" && draft.locked_consent && (
                <textarea
                  className={styles.textarea}
                  style={{ marginTop: "var(--sp-2)" }}
                  value={draft.consent_text ?? ""}
                  onChange={(e) => setDraft({ ...draft, consent_text: e.target.value })}
                  placeholder="The consent text your clients must agree to."
                />
              )}
            </div>
            <input
              type="checkbox"
              checked={draft[p.key]}
              onChange={(e) => setDraft({ ...draft, [p.key]: e.target.checked })}
              aria-label={p.title}
            />
          </div>
        ))}
      </div>
    </form>
  );
}
