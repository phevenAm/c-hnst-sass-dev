import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { supabase } from "@lib/supabase";

import { generateAccessToken } from "../../../utils/AdminClientsPageUtils";
import styles from "../../AdminClientsPage.module.scss";

export default function InviteClientModal({ onClose }: { onClose: () => void }) {
  const { authUser, isDemo } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token] = useState(generateAccessToken());
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const canSend = email.trim().length > 3 && email.includes("@");

  const handleInvite = async () => {
    if (!canSend || !authUser) return;
    if (isDemo) {
      setError("Demo mode — invites can't actually be sent.");
      return;
    }
    setError("");
    setSending(true);

    const { error: tokenError } = await supabase
      .from("platform_access_token")
      .insert({ token, admin_id: authUser.id, is_used: false });

    if (tokenError) {
      setSending(false);
      setError(tokenError.message);
      return;
    }

    const { error: fnError } = await supabase.functions.invoke("invite-client", {
      body: {
        email: email.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        token,
        message: message.trim() || undefined,
      },
    });

    setSending(false);
    if (fnError) {
      setError(fnError.message || "Token created, but the invitation email failed to send.");
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <Modal title="Invitation sent" onClose={onClose} size="sm">
        <p className={styles.modalText}>
          {firstName.trim() || email} has been emailed a sign-up link with their access token already applied.
        </p>
        <div className={styles.generatedTokenBox}>
          <p className={styles.generatedTokenLabel}>Access token (in case you need it directly)</p>
          <p className={styles.generatedToken}>{token}</p>
        </div>
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite a client"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleInvite} disabled={!canSend || sending}>
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <p className={styles.modalText}>
        Creates an access token and emails your client a sign-up link with it already applied — they just fill in the
        rest.
      </p>
      {error && <p className={styles.modalError}>{error}</p>}
      <div className={styles.field}>
        <label htmlFor="invite-first-name">First name</label>
        <input id="invite-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor="invite-last-name">Last name</label>
        <input id="invite-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor="invite-email">Email *</label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@example.com"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="invite-message">Personal message (optional)</label>
        <textarea id="invite-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </div>
    </Modal>
  );
}
