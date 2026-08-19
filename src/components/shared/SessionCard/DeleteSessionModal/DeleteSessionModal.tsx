import { useState } from "react";

import { FunctionsHttpError } from "@supabase/supabase-js";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import { useAuth } from "@context/AuthContext";

import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import type { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { deleteSession } from "@/store/slices/sessionsSlice";

type DeleteModalProps = {
  session: Session;
  onClose: () => void;
};

const DeleteSessionModal = ({ session, onClose }: DeleteModalProps) => {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isDemo, isAdmin, rescheduleCutoffHours } = useAuth();
  const [notifyClient, setNotifyClient] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Same reasoning as CancelSessionModal — only admins get asked, and only
  // when there's actually a Stripe payment to refund.
  const canRefund = isAdmin && session.paid && !!session.stripe_payment_intent_id;
  const cutoffHours = rescheduleCutoffHours ?? null;
  const msUntilSession = new Date(session.scheduled_at).getTime() - Date.now();
  const outsideCutoff = cutoffHours === null || msUntilSession > cutoffHours * 60 * 60 * 1000;
  const [issueRefund, setIssueRefund] = useState(outsideCutoff);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Route through cancel-session first so a Stripe-paid session still goes
      // through the same refund decision as Cancel does, before the row
      // disappears — deleting shouldn't let someone dodge that.
      const { data, error: fnError } = await supabase.functions.invoke("cancel-session", {
        body: { session_id: session.id, issue_refund: canRefund ? issueRefund : undefined },
      });
      if (fnError) {
        let message = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          const body = await fnError.context.json().catch(() => null);
          if (body?.error) message = body.error;
        }
        throw new Error(message);
      }

      await dispatch(deleteSession(session.id)).unwrap();
      if (notifyClient) {
        supabase.functions.invoke("notify-session-cancelled", { body: { session_id: session.id } });
      }
      let message = "Session deleted.";
      if (data?.refund_issued) {
        message = `Session deleted — £${(data.refund_amount_pence / 100).toFixed(2)} refunded.`;
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
      {canRefund && (
        <label
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "1rem",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={issueRefund} onChange={(e) => setIssueRefund(e.target.checked)} />
          Refund the £{(session.price_pence / 100).toFixed(2)} payment
        </label>
      )}
    </ConfirmModal>
  );
};

export default DeleteSessionModal;
