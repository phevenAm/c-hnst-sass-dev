import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Agency } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { selectAgency, selectIsAgencyManager, updateAgencyPolicies } from "@store/slices/agencySlice";

import styles from "../agency.module.scss";

type PolicyKey = "shared_resources" | "require_note_encryption" | "locked_email_templates";

const POLICIES: { key: PolicyKey; title: string; blurb: string }[] = [
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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={styles.switch}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className={styles.switchTrack} />
    </label>
  );
}

export default function AgencySettingsPage() {
  const dispatch = useAppDispatch();
  const { authUser } = useAuth();
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
  if (!draft || !authUser) return <p className={styles.empty}>Loading…</p>;

  const set = (patch: Partial<Agency>) => setDraft({ ...draft, ...patch });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await dispatch(
        updateAgencyPolicies({
          id: draft.id,
          name: draft.name.trim(),
          logo_url: draft.logo_url,
          locked_consent: draft.locked_consent,
          consent_text: draft.consent_text,
          consent_pdf_url: draft.consent_pdf_url,
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
          <p className={styles.subtitle}>Your agency's identity and the rules that apply to every member.</p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* ── Identity ── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Identity</h2>
        <p className={styles.cardBlurb}>Shown next to the Clarity mark in manage mode.</p>

        <div className={styles.logoLockup}>
          {draft.logo_url ? (
            <img src={draft.logo_url} alt="Agency logo" className={styles.logoImg} />
          ) : (
            <div className={styles.logoImg} aria-hidden="true" />
          )}
          <div>
            <UploadAndDisplayImage userId={authUser.id} bucket="logos" onUpload={(url) => set({ logo_url: url })} />
            {draft.logo_url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set({ logo_url: null })}>
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className={styles.field} style={{ maxWidth: 400 }}>
          <label className={styles.label} htmlFor="ag-name">
            Agency name
          </label>
          <input
            id="ag-name"
            className={styles.input}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
      </div>

      {/* ── Client consent ── */}
      <div className={styles.card}>
        <div className={styles.toggleRow} style={{ borderBottom: "none", paddingTop: 0 }}>
          <div className={styles.toggleText}>
            <strong>Agency client consent</strong>
            <span>Members use the agency's consent below instead of setting their own.</span>
          </div>
          <Switch
            checked={draft.locked_consent}
            onChange={(v) => set({ locked_consent: v })}
            label="Agency client consent"
          />
        </div>

        {draft.locked_consent && (
          <div style={{ marginTop: "var(--sp-3)" }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ag-consent">
                Consent text
              </label>
              <textarea
                id="ag-consent"
                className={styles.textarea}
                style={{ minHeight: 140 }}
                value={draft.consent_text ?? ""}
                onChange={(e) => set({ consent_text: e.target.value })}
                placeholder="The consent wording your clients must agree to."
              />
            </div>
            <div className={styles.field} style={{ marginTop: "var(--sp-3)" }}>
              <span className={styles.label}>Or attach a consent PDF</span>
              <PdfUpload
                adminId={authUser.id}
                value={draft.consent_pdf_url ?? ""}
                onChange={(url) => set({ consent_pdf_url: url })}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Policies ── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Member policies</h2>
        <p className={styles.cardBlurb}>Rules the agency enforces across every member's practice.</p>
        {POLICIES.map((p) => (
          <div key={p.key} className={styles.toggleRow}>
            <div className={styles.toggleText}>
              <strong>{p.title}</strong>
              <span>{p.blurb}</span>
            </div>
            <Switch checked={draft[p.key]} onChange={(v) => set({ [p.key]: v } as Partial<Agency>)} label={p.title} />
          </div>
        ))}
      </div>
    </form>
  );
}
