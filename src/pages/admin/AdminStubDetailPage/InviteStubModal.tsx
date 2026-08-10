import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import type { ClientStub } from "@models/globalTypes";

import { generateAccessToken } from "../utils/AdminClientsPageUtils";

import styles from "./AdminStubDetailPage.module.scss";

type Props = {
  stub: ClientStub;
  onClose: () => void;
};

export default function InviteStubModal({ stub, onClose }: Props) {
  const { isDemo } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState(stub.email ?? "");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(generateAccessToken);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: insertError } = await supabase
      .from("platform_access_token")
      .insert({ token, stub_id: stub.id, is_used: false });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const { error: fnError } = await supabase.functions.invoke("invite-stub-client", {
      body: { stub_id: stub.id, email: email.trim(), message: message.trim(), token },
    });

    if (fnError) {
      let msg = fnError.message;
      try {
        // The actual error detail is in the raw Response on fnError.context
        const body = await (fnError as any).context?.json?.();
        if (body?.error) msg = body.error;
      } catch {}
      setError(msg);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  };

  if (done) {
    return (
      <Modal title="Invitation sent" size="sm" onClose={onClose} actions={<Button onClick={onClose}>Done</Button>}>
        <p className={styles.linkHint}>
          An invitation email has been sent to <strong>{email}</strong>. When they sign up using the access token, their
          account will be automatically linked to this offline client profile.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite to platform"
      size="sm"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading || !email.trim()}>
            {loading ? "Sending…" : "Send invite"}
          </Button>
        </>
      }
    >
      <p className={styles.linkHint}>
        Send this client an invitation to join the platform. When they sign up with the access token below, their
        account will be automatically linked to this offline profile and all notes transferred.
      </p>

      {error && <p className={styles.modalError}>{error}</p>}

      <div className={styles.field} style={{ marginBottom: "var(--sp-4)" }}>
        <label htmlFor="invite-email">Email address</label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@example.com"
        />
      </div>

      <div className={styles.field} style={{ marginBottom: "var(--sp-4)" }}>
        <label htmlFor="invite-message">Personal message (optional)</label>
        <textarea
          id="invite-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a personal note to include in the email…"
          rows={3}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="invite-token">Access token</label>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <input
            id="invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, fontFamily: "monospace" }}
          />
          <Button variant="ghost" size="sm" onClick={() => setToken(generateAccessToken())}>
            Regenerate
          </Button>
        </div>
      </div>
    </Modal>
  );
}
