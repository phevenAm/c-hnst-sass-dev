import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useEncryption } from "@context/EncryptionContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import type { UserProfile } from "@models/globalTypes";

import styles from "../../AdminClientsPage.module.scss";

type GateMode = "password" | "recovery";

type SessionNote = {
  id: string;
  content: string;
  is_encrypted: boolean;
  note_iv: string | null;
  created_at: string;
};

type Props = {
  user: UserProfile;
  sessionId?: string;
  onClose: () => void;
};

export default function SessionNotesModal({ user, sessionId, onClose }: Props) {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const {
    status,
    checkStatus,
    pendingCode,
    clearPendingCode,
    setupEncryption,
    unlockWithPassword,
    relinkWithCode,
    encryptNote,
    decryptNote,
  } = useEncryption();

  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Unlock / recovery gate state
  const [gateMode, setGateMode] = useState<GateMode>("password");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateWorking, setGateWorking] = useState(false);

  const handleUnlock = async () => {
    setGateWorking(true);
    setGateError("");
    const result = await unlockWithPassword(unlockPassword);
    if (result === "wrong_password") {
      setGateError("Incorrect password. Try your encryption code instead.");
    } else if (result === "no_key") {
      setGateError("No encryption key found — notes may not be set up yet.");
    }
    setGateWorking(false);
  };

  const handleRelink = async () => {
    if (!recoveryCode.trim() || !recoveryNewPassword.trim()) return;
    setGateWorking(true);
    setGateError("");
    const ok = await relinkWithCode(recoveryCode.trim(), recoveryNewPassword);
    if (!ok) {
      setGateError("Could not unlock — check your encryption code and try again.");
    } else {
      setShowInlineRecovery(false);
      setRecoveryCode("");
      setRecoveryNewPassword("");
    }
    setGateWorking(false);
  };

  const handleSetup = async () => {
    if (!unlockPassword) return;
    setGateWorking(true);
    setGateError("");
    try {
      await setupEncryption(unlockPassword);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Setup failed. Please try again.");
    }
    setGateWorking(false);
  };

  useEffect(() => {
    if (status === "checking") checkStatus();
  }, [status, checkStatus]);

  useEffect(() => {
    if (status !== "unlocked" && !isDemo) return;

    const fetchNotes = async () => {
      setLoading(true);
      let q = supabase
        .from("session_notes")
        .select("id, content, is_encrypted, note_iv, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (sessionId) {
        q = q.eq("session_id", sessionId);
      } else {
        q = q.is("session_id", null);
      }

      const { data, error } = await q;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const decrypted = await Promise.all(
        (data ?? []).map(async (n) => {
          if (n.is_encrypted && n.note_iv) {
            try {
              return { ...n, content: await decryptNote(n.content, n.note_iv) };
            } catch {
              return { ...n, content: "[Could not decrypt]" };
            }
          }
          return n;
        }),
      );

      setNotes(decrypted);
      setLoading(false);
    };

    fetchNotes();
  }, [user.id, sessionId, status, isDemo, decryptNote]);

  const handleAdd = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }
    if (!content.trim() || !userProfile) return;
    setSaving(true);

    const plaintext = content.trim();
    let insertPayload: Record<string, unknown>;

    try {
      const { iv, ciphertext } = await encryptNote(plaintext);
      insertPayload = {
        admin_id: userProfile.id,
        user_id: user.id,
        session_id: sessionId ?? null,
        content: ciphertext,
        is_encrypted: true,
        note_iv: iv,
      };
    } catch {
      showToast("Encryption failed — note not saved.", "warning");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("session_notes")
      .insert(insertPayload)
      .select("id, content, is_encrypted, note_iv, created_at")
      .single();

    if (error) {
      setError(error.message);
      showToast("Sorry, something went wrong", "warning");
    } else {
      setNotes((prev) => [{ ...data, content: plaintext }, ...prev]);
      setContent("");
      showToast("Note added");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    setDeletingId(id);
    const { error } = await supabase.from("session_notes").delete().eq("id", id);
    if (error) setError(error.message);
    else setNotes((prev) => prev.filter((n) => n.id !== id));
    setDeletingId(null);
  };

  const modalTitle = sessionId
    ? `Session Notes — ${user.first_name} ${user.last_name}`
    : `Account Summary — ${user.first_name} ${user.last_name}`;

  if (status === "checking") {
    return (
      <Modal title={modalTitle} onClose={onClose} size="md">
        <p className={styles.empty}>Loading…</p>
      </Modal>
    );
  }

  if (status === "locked") {
    const showCodeForm = gateMode === "recovery";
    return (
      <Modal title={modalTitle} onClose={onClose} size="md">
        <div className={styles.encGate}>
          {showCodeForm ? (
            <>
              <p className={styles.encGateTitle}>Unlock with your encryption code</p>
              <p className={styles.encGateBody}>
                Enter the 4-word code shown when you first set up encryption, plus your current login password. This
                re-links the code to your password so future logins work normally.
              </p>
              <input
                type="text"
                className={styles.encInput}
                placeholder="Encryption code (e.g. calm-reef-gold-pine)"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                autoComplete="off"
              />
              <input
                type="password"
                className={styles.encInput}
                placeholder="Your current login password"
                value={recoveryNewPassword}
                onChange={(e) => setRecoveryNewPassword(e.target.value)}
              />
              {gateError && <p className={styles.modalError}>{gateError}</p>}
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  onClick={handleRelink}
                  disabled={gateWorking || !recoveryCode.trim() || !recoveryNewPassword.trim()}
                >
                  {gateWorking ? "Unlocking…" : "Unlock notes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setGateMode("password");
                    setGateError("");
                  }}
                >
                  Back
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.encGateTitle}>Notes are locked</p>
              <p className={styles.encGateBody}>Enter your login password to unlock your encrypted notes.</p>
              <input
                type="password"
                className={styles.encInput}
                placeholder="Your login password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
              {gateError && <p className={styles.modalError}>{gateError}</p>}
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <Button size="sm" onClick={handleUnlock} disabled={gateWorking || !unlockPassword}>
                  {gateWorking ? "Unlocking…" : "Unlock notes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setGateMode("recovery");
                    setGateError("");
                  }}
                >
                  Use encryption code instead
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    );
  }

  if (status === "disabled" && !isDemo) {
    return (
      <Modal title={modalTitle} onClose={onClose} size="md">
        <div className={styles.encGate}>
          <p className={styles.encGateTitle}>Set up note encryption</p>
          <p className={styles.encGateBody}>
            Notes are encrypted in your browser. Enter your login password to enable encryption — you'll get a 4-word
            encryption code to save somewhere safe. The code never changes unless you request a new one.
          </p>
          <input
            type="password"
            className={styles.encInput}
            placeholder="Your login password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetup()}
          />
          {gateError && <p className={styles.modalError}>{gateError}</p>}
          <Button size="sm" onClick={handleSetup} disabled={gateWorking || !unlockPassword}>
            {gateWorking ? "Setting up…" : "Enable encryption"}
          </Button>
        </div>
      </Modal>
    );
  }

  if (status === "unlocked" && pendingCode) {
    return (
      <Modal title={modalTitle} onClose={onClose} size="md">
        <div className={styles.encGate}>
          <p className={styles.encGateTitle}>Your notes are now encrypted</p>
          <p className={styles.encGateBody}>
            Save this 4-word encryption code somewhere safe — a password manager or printed copy. If you ever reset your
            password, you'll use this code to regain access. It never changes unless you request a new one.
          </p>
          <div className={styles.recoveryCodeBox}>{pendingCode}</div>
          <Button onClick={clearPendingCode} size="sm">
            I've saved it — continue
          </Button>
        </div>
      </Modal>
    );
  }

  let notesSection;
  if (loading) {
    notesSection = <p className={styles.empty}>Loading…</p>;
  } else if (notes.length === 0) {
    notesSection = (
      <p className={styles.empty}>{sessionId ? "No notes for this session yet." : "No account summary yet."}</p>
    );
  } else {
    notesSection = (
      <ul className={styles.notesList}>
        {notes.map((note) => (
          <li key={note.id} className={styles.noteItem}>
            <div className={styles.noteHeader}>
              <span className={styles.noteDate}>
                {new Date(note.created_at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(note.id)}
                disabled={isDemo || deletingId === note.id}
                aria-label="Delete note"
              >
                {deletingId === note.id ? "…" : "Delete"}
              </Button>
            </div>
            <p className={styles.noteContent}>{note.content}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Modal title={modalTitle} onClose={onClose} size="md">
      {error && <p className={styles.modalError}>{error}</p>}

      <div className={styles.notesAddForm}>
        <textarea
          className={styles.notesTextarea}
          placeholder={sessionId ? "Add a session note…" : "Add an account summary note…"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
        />
        <div className={styles.notesFormActions}>
          <Button size="sm" onClick={handleAdd} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>
      {notesSection}
    </Modal>
  );
}
