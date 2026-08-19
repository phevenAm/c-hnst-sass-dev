import { useState } from "react";

import { FunctionsHttpError } from "@supabase/supabase-js";
import dayjs from "dayjs";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";

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
  const [notifyClient, setNotifyClient] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      // cancel-session also issues a Stripe refund when the session was paid
      // by card and cancellation falls outside the practice's cutoff window.
      const { data, error: fnError } = await supabase.functions.invoke("cancel-session", {
        body: { session_id: session.id },
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
      if (data?.refunded) {
        message = `Session cancelled — £${(data.refund_amount_pence / 100).toFixed(2)} refunded.`;
      } else if (data?.refund_skipped_reason === "within_cutoff") {
        message = "Session cancelled — no refund (within the cancellation window).";
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
    </ConfirmModal>
  );
};

export default CancelSessionModal;
