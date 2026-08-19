import { useState } from "react";

import dayjs from "dayjs";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";

import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { updateSession } from "@/store/slices/sessionsSlice";

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
      await dispatch(updateSession({ id: session.id, status: "cancelled" })).unwrap();
      if (notifyClient) {
        supabase.functions.invoke("notify-session-cancelled", { body: { session_id: session.id } });
      }
      showToast("Session cancelled.", "success");
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
