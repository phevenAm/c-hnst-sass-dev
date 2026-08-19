import { useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import { useToast } from "@/context/ToastContext";
import { useCounsellorName } from "@/Hooks/useCounsellorName";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";

type ClientCancelModalProps = {
  session: Session;
  onClose: () => void;
};

const ClientCancelModal = ({ session, onClose }: ClientCancelModalProps) => {
  const { showToast } = useToast();
  const counsellorName = useCounsellorName();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async () => {
    setIsSending(true);

    const { error, data } = await supabase.functions.invoke("request-cancel-session", {
      body: {
        session_id: session.id,
        message: message.trim() || undefined,
      },
    });

    if (error || data?.error) {
      const msg = data?.error ?? "Failed to send request. Please try again.";
      showToast(msg, "danger");
    } else {
      showToast(`Cancellation request sent to ${counsellorName}.`);
      onClose();
    }
    setIsSending(false);
  };

  return (
    <Modal
      title="Request cancellation"
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button onClick={handleSubmit} disabled={isSending}>
            {isSending ? "Sending…" : "Send request"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Never mind
          </Button>
        </div>
      }
    >
      <p style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        Request to cancel your session on <strong>{dayjs(session.scheduled_at).format("dddd D MMM [at] h:mma")}</strong>
        . {counsellorName} will review it — your session stays booked until they confirm.
      </p>
      <textarea
        placeholder="Any context for the cancellation? (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem" }}
      />
    </Modal>
  );
};

export default ClientCancelModal;
