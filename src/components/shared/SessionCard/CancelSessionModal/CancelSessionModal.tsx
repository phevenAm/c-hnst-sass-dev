import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

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

  const handleCancel = async () => {
    try {
      await dispatch(updateSession({ id: session.id, status: "cancelled" })).unwrap();
      supabase.functions.invoke("notify-session-cancelled", { body: { session_id: session.id } });
      showToast("Session cancelled.", "success");
      onClose();
    } catch (error: any) {
      showToast(error?.message ?? "Failed to cancel session.", "danger");
    }
  };

  return (
    <Modal
      title="Cancel session?"
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant="danger" onClick={handleCancel}>
            Yes, cancel it
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
        </div>
      }
    >
      <p>Cancel your session on {dayjs(session.scheduled_at).format("dddd D MMM [at] h:mma")}?</p>
    </Modal>
  );
};

export default CancelSessionModal;
