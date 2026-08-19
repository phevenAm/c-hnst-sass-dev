import { useState } from "react";

import { FunctionsHttpError } from "@supabase/supabase-js";
import dayjs from "dayjs";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { upsertSession } from "@/store/slices/sessionsSlice";

type CancelSessionModalProps = {
  session: Session;
  onClose: () => void;
};

const CancelSessionModal = ({ session, onClose }: CancelSessionModalProps) => {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { isAdmin, rescheduleCutoffHours } = useAuth();
  const [notifyClient, setNotifyClient] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Only meaningful for admins cancelling a Stripe-paid session — the client
  // can't decide their own refund. Default follows the practice's cutoff
  // window as a suggestion, but the admin can override either way (e.g. no
  // refund for a paid no-show, or a goodwill refund inside the window).
  const canRefund = isAdmin && session.paid && !!session.stripe_payment_intent_id;
  const cutoffHours = rescheduleCutoffHours ?? null;
  const msUntilSession = new Date(session.scheduled_at).getTime() - Date.now();
  const outsideCutoff = cutoffHours === null || msUntilSession > cutoffHours * 60 * 60 * 1000;
  const [issueRefund, setIssueRefund] = useState(outsideCutoff);

  const handleCancel = async () => {
    setCancelling(true);
    try {
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
      dispatch(upsertSession({ ...session, status: "cancelled" }));
      if (notifyClient) {
        supabase.functions.invoke("notify-session-cancelled", { body: { session_id: session.id } });
      }
      let message = "Session cancelled.";
      if (data?.refund_issued) {
        message = `Session cancelled — £${(data.refund_amount_pence / 100).toFixed(2)} refunded.`;
      }
      showToast(message, "success");
      onClose();
    } catch (error: any) {
      showToast(error?.message ?? "Failed to cancel session.", "danger");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <ConfirmModal
      title="Cancel session?"
      onClose={onClose}
      onConfirm={handleCancel}
      confirming={cancelling}
      confirmLabel="Yes, cancel it"
      cancelLabel="Keep it"
      notifyOption={{
        label: "Email the client that this session was cancelled",
        checked: notifyClient,
        onChange: setNotifyClient,
      }}
    >
      <p>Cancel your session on {dayjs(session.scheduled_at).format("dddd D MMM [at] h:mma")}?</p>
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

export default CancelSessionModal;
