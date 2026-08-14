import { useState } from "react";

import { useAuth } from "../../context/AuthContext";
import Button from "../shared/Button/Button";

import styles from "./ConsentModal.module.scss";

interface ConsentSettings {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
  consent_counsellor_cta: string;
}

interface Props {
  settings: ConsentSettings;
  onComplete: () => void;
}

export default function ConsentModal({ settings, onComplete }: Props) {
  const { updateProfile } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAgree = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        has_consented: true,
        consented_at: new Date().toISOString(),
      });
      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Terms and consent">
        <div className={styles.header}>
          <h2 className={styles.title}>{settings.consent_title}</h2>
        </div>

        {settings.consent_body && (
          <div className={styles.body}>
            {settings.consent_body
              .split("\n")
              .map((line, i) => (line.trim() === "" ? <br key={i} /> : <p key={i}>{line}</p>))}
          </div>
        )}

        {settings.consent_pdf_url && (
          <iframe src={settings.consent_pdf_url} className={styles.pdfFrame} title="Document" />
        )}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className={styles.checkbox}
          />
          <span>I confirm I have read and agree to the above</span>
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleAgree} disabled={!agreed || saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>

        {settings.consent_counsellor_cta && <p className={styles.counsellorCta}>{settings.consent_counsellor_cta}</p>}
      </div>
    </div>
  );
}
