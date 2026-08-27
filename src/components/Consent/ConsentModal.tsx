import { useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "../../context/AuthContext";
import Button from "../shared/Button/Button";
import PdfViewer from "../shared/PdfViewer/PdfViewer";

import styles from "./ConsentModal.module.scss";

interface ConsentSettings {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
  consent_counsellor_cta: string;
  consent_document_id: string | null;
}

interface Props {
  settings: ConsentSettings;
  onComplete: () => void;
}

export default function ConsentModal({ settings, onComplete }: Props) {
  const { updateProfile, isDemo } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [printedName, setPrintedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = agreed && printedName.trim().length > 0;

  const handleAgree = async () => {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const name = printedName.trim();

      // When the gate is driven by an Onboarding document, record a proper
      // signature row against it. The RPC also sets has_consented server-side,
      // but we still call updateProfile below to sync local state (and it's
      // the only path for demo users, who never hit the RPC).
      if (settings.consent_document_id && !isDemo) {
        const { error: rpcError } = await supabase.rpc("sign_document", {
          p_document_id: settings.consent_document_id,
          p_signed_name: name,
        });
        if (rpcError) throw rpcError;
      }

      await updateProfile({
        has_consented: true,
        consented_at: new Date().toISOString(),
        consent_signed_name: name,
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
            {settings.consent_body.split("\n").map((line, i) =>
              line.trim() === "" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <br key={i} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <p key={i}>{line}</p>
              ),
            )}
          </div>
        )}

        {settings.consent_pdf_url && <PdfViewer url={settings.consent_pdf_url} title={settings.consent_title} />}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className={styles.checkbox}
          />
          <span>I confirm I have read and agree to the above</span>
        </label>

        <div className={styles.field}>
          <label htmlFor="consent-printed-name" className={styles.fieldLabel}>
            Type your full name to sign
          </label>
          <input
            id="consent-printed-name"
            type="text"
            value={printedName}
            onChange={(e) => setPrintedName(e.target.value)}
            placeholder="Full name"
            className={styles.nameInput}
            autoComplete="name"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleAgree} disabled={!canContinue || saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>

        {settings.consent_counsellor_cta && <p className={styles.counsellorCta}>{settings.consent_counsellor_cta}</p>}
      </div>
    </div>
  );
}
