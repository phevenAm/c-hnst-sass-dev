import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import PasswordInput from "@components/shared/PasswordInput/PasswordInput";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./ChangePasswordModal.module.scss";

type Props = { onClose: () => void };

export default function ChangePasswordModal({ onClose }: Props) {
  const { showToast } = useToast();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
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

        <div className={styles.field}>
          <label htmlFor="new-password">New password</label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="confirm-password">Confirm new password</label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
