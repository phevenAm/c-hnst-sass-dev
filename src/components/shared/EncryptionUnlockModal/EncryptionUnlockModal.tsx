import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useEncryption } from "@context/EncryptionContext";

import styles from "./EncryptionUnlockModal.module.scss";

// The unlock / setup gate, lifted out of SessionNotesModal so the navbar
// encryption pill can open it directly — an admin shouldn't have to open a
// client's notes just to unlock. Same three states SessionNotesModal handles:
//   locked   → enter the 4-word code (the ONLY unlock path — see commit
//              469406a "remove password-based unlock")
//   disabled → turn encryption on, which mints the 4-word code
//   unlocked + pendingCode → show the freshly minted code to save
export default function EncryptionUnlockModal({ onClose }: { onClose: () => void }) {
  const { status, setupEncryption, unlockWithCode, pendingCode, clearPendingCode } = useEncryption();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  // Once we're unlocked and any freshly minted code has been dismissed there's
  // nothing left for this modal to do.
  useEffect(() => {
    if (status === "unlocked" && !pendingCode) onClose();
  }, [status, pendingCode, onClose]);

  const handleUnlock = async () => {
    if (!code.trim()) return;
    setWorking(true);
    setError("");
    const result = await unlockWithCode(code.trim());
    if (result === "wrong_code") {
      setError("Incorrect encryption code. Check it and try again.");
    } else if (result === "no_key") {
      setError("No encryption key found — notes may not be set up yet.");
    } else {
      setCode("");
    }
    setWorking(false);
  };

  const handleSetup = async () => {
    setWorking(true);
    setError("");
    try {
      await setupEncryption();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Please try again.");
    }
    setWorking(false);
  };

  if (status === "unlocked" && pendingCode) {
    return (
      <Modal title="Note encryption" onClose={onClose} size="md">
        <div className={styles.gate}>
          <p className={styles.title}>Your notes are now encrypted</p>
          <p className={styles.body}>
            Save this 4-word encryption code somewhere safe — a password manager or a printed copy. If you ever reset
            your password, you'll use it to regain access. It never changes unless you request a new one.
          </p>
          <div className={styles.codeBox}>{pendingCode}</div>
          <Button size="sm" onClick={clearPendingCode}>
            I've saved it — continue
          </Button>
        </div>
      </Modal>
    );
  }

  if (status === "disabled") {
    return (
      <Modal title="Set up note encryption" onClose={onClose} size="md">
        <div className={styles.gate}>
          <p className={styles.body}>
            Notes are encrypted in your browser. Set it up now and you'll get a 4-word encryption code — save it
            somewhere safe, since it's the only way to unlock your notes from here on. It never changes unless you
            request a new one.
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <Button size="sm" onClick={handleSetup} disabled={working}>
            {working ? "Setting up…" : "Enable encryption"}
          </Button>
        </div>
      </Modal>
    );
  }

  // locked (default)
  return (
    <Modal title="Unlock notes" onClose={onClose} size="md">
      <div className={styles.gate}>
        <p className={styles.body}>
          Enter your 4-word encryption code to unlock. Your login password won't work here — the code is a separate
          secret, kept apart from your login on purpose.
        </p>
        <input
          type="text"
          className={styles.input}
          placeholder="Encryption code (e.g. calm-reef-gold-pine)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          autoComplete="off"
        />
        {error && <p className={styles.error}>{error}</p>}
        <Button size="sm" onClick={handleUnlock} disabled={working || !code.trim()}>
          {working ? "Unlocking…" : "Unlock notes"}
        </Button>
      </div>
    </Modal>
  );
}
