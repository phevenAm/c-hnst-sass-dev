import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useEncryption } from "@context/EncryptionContext";

import styles from "../ChangePasswordModal/ChangePasswordModal.module.scss";

type Props = { onClose: () => void };

export default function RegenerateCodeModal({ onClose }: Props) {
  const { pendingCode, clearPendingCode, regenerateCode } = useEncryption();

  const [currentCode, setCurrentCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleRegenerate = async () => {
    if (!currentCode.trim()) return;
    setError(null);
    setWorking(true);
    const ok = await regenerateCode(currentCode.trim());
    setWorking(false);
    if (!ok) {
      setError("Incorrect encryption code.");
      return;
    }
    setCurrentCode("");
  };

  // Same one-time reveal pattern as first-time setup (SessionNotesModal) —
  // the code is shown once here, then cleared; it's never retrievable again.
  if (pendingCode) {
    return (
      <Modal title="New encryption code" onClose={onClose} size="sm">
        <div className={styles.form}>
          <p>
            Save this 4-word code somewhere safe — a password manager or printed copy. Your old code no longer works.
            Existing notes are unaffected.
          </p>
          <p style={{ fontSize: "1.25rem", fontWeight: 600, textAlign: "center", letterSpacing: "0.02em" }}>
            {pendingCode}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              clearPendingCode();
              onClose();
            }}
          >
            I've saved it — done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Get a new encryption code"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="primary" onClick={handleRegenerate} disabled={working || !currentCode.trim()}>
            {working ? "Generating…" : "Generate new code"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRegenerate();
        }}
        className={styles.form}
      >
        {error && <p className={styles.error}>{error}</p>}
        <p>
          This replaces your current 4-word encryption code with a new one. Your existing session notes stay exactly as
          they are — only the code itself changes, so any copy of the old code you'd saved stops working.
        </p>
        <div className={styles.field}>
          <label htmlFor="regen-code">Current encryption code</label>
          <input
            id="regen-code"
            type="text"
            autoComplete="off"
            placeholder="e.g. calm-reef-gold-pine"
            value={currentCode}
            onChange={(e) => setCurrentCode(e.target.value)}
          />
          <p className={styles.hint}>Required to prove you hold the current code before re-wrapping the notes' key.</p>
        </div>
      </form>
    </Modal>
  );
}
