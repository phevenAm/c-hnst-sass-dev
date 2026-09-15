import React, { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAppDispatch } from "@store/hooks";
import { deleteUser } from "@store/slices/userDirectorySlice";

type DeleteClientModalProps = {
  onClose: () => void;
  bodyText: React.ReactNode;
  modalTitle?: string;
  id: string;
};

export default function DeleteClientModal({
  onClose,
  id,
  bodyText,
  modalTitle = "Delete user",
}: DeleteClientModalProps) {
  const dispatch = useAppDispatch();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await dispatch(deleteUser(id)).unwrap();
      onClose();
    } catch (err) {
      console.error("Failed to delete user", err);
      setError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={modalTitle}
      onClose={onClose}
      actions={
        <>
          <Button variant="primary" onClick={onClose} aria-label="cancel user deletion" disabled={deleting}>
            Cancel
          </Button>

          <Button variant="danger" onClick={handleConfirm} aria-label="confirm user deletion" disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <p>{bodyText}</p>
      {error && <p style={{ color: "var(--error)", marginTop: "0.5rem" }}>{error}</p>}
    </Modal>
  );
}
