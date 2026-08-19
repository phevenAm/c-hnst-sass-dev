import { useState } from "react";

import { FunctionsHttpError } from "@supabase/supabase-js";

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
      // Route through cancel-session first so a Stripe-paid session still gets
      // flagged for a refund (per the practice's cutoff window) before the row
      // disappears — deleting shouldn't let someone dodge the same refund
      // policy cancelling does. Never refunds automatically — this only
      // creates a pending request for the admin to approve from Payments.
      const { data, error: fnError } = await supabase.functions.invoke("cancel-session", {
        body: { session_id: id },
      });
      if (fnError) {
        let message = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          const body = await fnError.context.json().catch(() => null);
          if (body?.error) message = body.error;
        }
        throw new Error(message);
      }

      await dispatch(deleteSession(id)).unwrap();
      if (notifyClient) {
        supabase.functions.invoke("notify-session-cancelled", { body: { session_id: id } });
      }
      let message = "Session deleted.";
      if (data?.refund_requested) {
        message = `Session deleted — £${(data.refund_amount_pence / 100).toFixed(2)} refund pending admin approval.`;
      } else if (data?.refund_skipped_reason === "within_cutoff") {
        message = "Session deleted — no refund (within the cancellation window).";
      }
      showToast(message, "success");
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
