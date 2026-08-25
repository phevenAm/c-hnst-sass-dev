import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { supabase } from "@lib/supabase";

import { generateAccessToken } from "../../../utils/AdminClientsPageUtils";
import styles from "../../AdminClientsPage.module.scss";

export default function AccessTokenModal({ onClose }: { onClose: () => void }) {
  const { authUser, isDemo } = useAuth();
  const [token, setToken] = useState(generateAccessToken());
  const [createdToken, setCreatedToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    const cleanedToken = token.trim();
    setError("");
    setCopied(false);

    if (isDemo) {
      setError("Demo mode — tokens can't actually be created.");
      return;
    }

    if (!cleanedToken) {
      setError("Token cannot be empty");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("platform_access_token")
      .insert({ token: cleanedToken, admin_id: authUser!.id, is_used: false })
      .select("token")
      .single();

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setCreatedToken(data.token);
  };

  const handleCopy = async () => {
    if (!createdToken) return;

    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const modalBody = !createdToken ? (
    <div className={styles.field}>
      <label htmlFor="access-token">Access token</label>
      <input id="access-token" value={token} onChange={(event) => setToken(event.target.value)} />
    </div>
  ) : (
    <div className={styles.generatedTokenBox}>
      <p className={styles.generatedTokenLabel}>Token created</p>
      <p className={styles.generatedToken}>{createdToken}</p>
    </div>
  );

  const modalActions = !createdToken ? (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={handleCreate} disabled={loading}>
        {loading ? "Creating…" : "Create token"}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={handleCopy}>
        {copied ? "Copied" : "Copy token"}
      </Button>
      <Button onClick={onClose}>Done</Button>
    </>
  );

  const ModalObj = {
    title: "Create client access token",
    onClose: onClose,
    actions: modalActions,
    size: "sm" as const,
  };

  return (
    <Modal {...ModalObj}>
      <p className={styles.modalText}>
        Give this token to a client. They must enter it during sign up before an account can be created.
      </p>
      {error && <p className={styles.modalError}>{error}</p>}
      {modalBody}
    </Modal>
  );
}
