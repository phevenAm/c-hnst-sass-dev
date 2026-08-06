import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useEncryption } from "@context/EncryptionContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./ChangePasswordModal.module.scss";

type Props = { onClose: () => void };

export default function ChangePasswordModal({ onClose }: Props) {
  const { showToast } = useToast();
  const encryption = useEncryption();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const encryptionActive = encryption.status === "unlocked";

  const handleSave = async () => {
    setError(null);
    if (encryptionActive && !currentPassword) {
      setError("Enter your current password to rotate the encryption key.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      if (encryptionActive) {
        // Rotate the note-encryption key before changing the Supabase password,
        // while the old password is still valid for deriving the old KEK.
        await encryption.rotateKey(currentPassword, newPassword);
      }

      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw new Error(err.message);

      showToast("Password updated.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Change password"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="primary" onClick={handleSave} disabled={saving || !newPassword || !confirmPassword}>
            {saving ? "Updating…" : "Update password"}
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
          handleSave();
        }}
        className={styles.form}
      >
        {error && <p className={styles.error}>{error}</p>}

        {encryptionActive && (
          <div className={styles.field}>
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <p className={styles.hint}>Required to re-wrap your note encryption key.</p>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
