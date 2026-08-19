import { useState } from "react";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import { useAuth } from "@context/AuthContext";

import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { useAppDispatch } from "@/store/hooks";
import { deleteSession } from "@/store/slices/sessionsSlice";

type DeleteModalProps = {
  id: string;
  onClose: () => void;
};

const DeleteSessionModal = ({ id, onClose }: DeleteModalProps) => {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isDemo } = useAuth();
  const [notifyClient, setNotifyClient] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dispatch(deleteSession(id)).unwrap();
      if (notifyClient) {
        supabase.functions.invoke("notify-session-cancelled", { body: { session_id: id } });
      }
      showToast("Session deleted", "success");
      onClose();
    } catch (error) {
      showToast(error.message as string, "danger");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ConfirmModal
      title="Delete session?"
      onClose={onClose}
      onConfirm={handleDelete}
      confirming={deleting || isDemo}
      confirmLabel="Yes, delete"
      cancelLabel="No, cancel"
      notifyOption={{
        label: "Email the client that this session was removed",
        checked: notifyClient,
        onChange: setNotifyClient,
      }}
    >
      <p>This action cannot be undone.</p>
    </ConfirmModal>
  );
};

export default DeleteSessionModal;
