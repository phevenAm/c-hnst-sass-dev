import React, { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { supabase } from "@lib/supabase";
import { useAppDispatch } from "@store/hooks";
import { deleteOwnAccount } from "@store/slices/userDirectorySlice";

type DeleteUserModalProps = {
  onClose: () => void;
};

export default function DeleteUserModal({ onClose }: DeleteUserModalProps) {
  const dispatch = useAppDispatch();
  const { signOut, userProfile, isAdmin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeletion = async () => {
    setDeleting(true);
    try {
      // Admins may have an active Stripe subscription and/or Connect account
      // — delete_own_account() only touches our own DB, so without this
      // Stripe would keep billing a deleted account indefinitely. Best-effort:
      // a Stripe hiccup here shouldn't trap someone who wants their account
      // gone, so we log and proceed rather than block on it.
      if (isAdmin) {
        const { data, error: fnError } = await supabase.functions.invoke("cancel-billing-before-delete");
        if (fnError || (data && !data.success)) {
          console.error("Failed to cancel billing before account deletion", fnError ?? data?.errors);
        }
      }
      await dispatch(deleteOwnAccount(userProfile?.id ?? "")).unwrap();
      await signOut();
    } catch (err) {
      console.error("Failed to delete user", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Delete your account forever?"
      onClose={onClose}
      actions={
        <>
          <Button variant="primary" onClick={onClose} aria-label="cancel user deletion" disabled={deleting}>
            Cancel
          </Button>

          <Button variant="danger" onClick={handleDeletion} aria-label="confirm user deletion" disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <p>Are you sure you want to delete your account? This action cannot be undone.</p>
      {error && <p style={{ color: "var(--error)", marginTop: "0.5rem" }}>{error}</p>}
    </Modal>
  );
}
