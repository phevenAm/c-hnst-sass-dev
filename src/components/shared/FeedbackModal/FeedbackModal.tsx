import { useState } from "react";

import { Button, Modal } from "@components/shared/index";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";

import styles from "./FeedbackModal.module.scss";

type FeedbackType = "bug" | "feature";

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      showToast("Please add a message");
      return;
    }
    if (isDemo) {
      showToast("Demo mode — feedback not saved.");
      onClose();
      return;
    }
    if (!authUser) return;

    setSubmitting(true);
    const trimmed = message.trim();
    const page = window.location.pathname;
    const { error } = await supabase.from("feedback").insert({
      submitter_id: authUser.id,
      type,
      message: trimmed,
      page,
    });
    setSubmitting(false);

    if (error) {
      showToast("Couldn't send feedback — please try again", "danger");
      return;
    }

    // Fire-and-forget email to the platform owner; never block the user on it.
    supabase.functions.invoke("notify-feedback", { body: { type, message: trimmed, page } });

    showToast("Thanks! Your feedback has been sent.");
    onClose();
  };

  return (
    <Modal
      title="Send feedback"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      <p className={styles.intro}>Found a bug or have an idea? Let us know — it goes straight to the team.</p>

      <div className={styles.typeToggle}>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === "bug" ? styles.active : ""}`}
          onClick={() => setType("bug")}
        >
          🐛 Bug
        </button>
        <button
          type="button"
          className={`${styles.typeBtn} ${type === "feature" ? styles.active : ""}`}
          onClick={() => setType("feature")}
        >
          💡 Feature idea
        </button>
      </div>

      <label className={styles.label} htmlFor="feedback-message">
        Your message
      </label>
      <textarea
        id="feedback-message"
        className={styles.textarea}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        maxLength={4000}
        placeholder={type === "bug" ? "What went wrong, and what were you doing?" : "What would you like to see?"}
      />
    </Modal>
  );
}
