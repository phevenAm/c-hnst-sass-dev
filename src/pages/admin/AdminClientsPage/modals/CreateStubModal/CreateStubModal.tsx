import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import type { ClientStub } from "@models/globalTypes";
import { useAppDispatch } from "@store/hooks";
import { createClientStub, updateClientStub } from "@store/slices/clientStubsSlice";

import styles from "../../AdminClientsPage.module.scss";

type Props = {
  onClose: () => void;
  existing?: ClientStub;
};

export default function CreateStubModal({ onClose, existing }: Props) {
  const dispatch = useAppDispatch();
  const { userProfile } = useAuth();
  const [firstName, setFirstName] = useState(existing?.first_name ?? "");
  const [lastName, setLastName] = useState(existing?.last_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [codename, setCodename] = useState(existing?.codename ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!existing;

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      if (isEdit) {
        await dispatch(
          updateClientStub({
            id: existing.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim() || null,
            codename: codename.trim() || null,
          }),
        ).unwrap();
      } else {
        await dispatch(
          createClientStub({
            created_by: userProfile!.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim() || null,
            codename: codename.trim() || null,
          }),
        ).unwrap();
      }
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? "Edit offline client" : "Create offline client"}
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create client"}
          </Button>
        </>
      }
    >
      {error && <p className={styles.modalError}>{error}</p>}

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label htmlFor="stub-first-name">First name</label>
          <input
            id="stub-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="stub-last-name">Last name</label>
          <input
            id="stub-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Smith"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="stub-email">Email (optional)</label>
        <input
          id="stub-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="stub-codename">Codename (optional)</label>
        <input
          id="stub-codename"
          value={codename}
          onChange={(e) => setCodename(e.target.value)}
          placeholder="Replaces real name across admin UI"
          maxLength={30}
        />
      </div>
    </Modal>
  );
}
