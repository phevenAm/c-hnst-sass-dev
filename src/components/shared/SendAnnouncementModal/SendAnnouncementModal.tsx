import { useEffect, useMemo, useState } from "react";

import { clientDisplayName } from "@Helpers/Helpers";
import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/models/globalTypes";

import styles from "./SendAnnouncementModal.module.scss";

type Props = {
  /** Active clients of the current practice. Omit to let the modal load them itself. */
  clients?: UserProfile[];
  useCodenames?: boolean;
  onClose: () => void;
  onSent?: (result: { sent: number; skipped: number }) => void;
};

export default function SendAnnouncementModal({ clients, useCodenames = false, onClose, onSent }: Props) {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const [fetched, setFetched] = useState<UserProfile[] | null>(null);
  const selfFetch = clients === undefined;

  useEffect(() => {
    if (!selfFetch || !userProfile?.id) return;
    supabase
      .from("users")
      .select("id, first_name, last_name, display_name, admin_codename, disabled")
      .eq("admin_id", userProfile.id)
      .eq("role", "client")
      .then(({ data }) => setFetched(((data as UserProfile[]) ?? []).filter((c) => !c.disabled)));
  }, [selfFetch, userProfile?.id]);

  const sorted = useMemo(() => {
    const source = clients ?? fetched ?? [];
    return [...source].sort((a, b) =>
      clientDisplayName(a, useCodenames).localeCompare(clientDisplayName(b, useCodenames)),
    );
  }, [clients, fetched, useCodenames]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touchedSelection, setTouchedSelection] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [sending, setSending] = useState(false);

  // Default to everyone once the list is known, until the user changes it.
  useEffect(() => {
    if (!touchedSelection && sorted.length > 0) {
      setSelected(new Set(sorted.map((c) => c.id)));
    }
  }, [sorted, touchedSelection]);

  const allSelected = selected.size === sorted.length && sorted.length > 0;

  const toggle = (id: string) => {
    setTouchedSelection(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setTouchedSelection(true);
    setSelected(allSelected ? new Set() : new Set(sorted.map((c) => c.id)));
  };

  const handleSend = async () => {
    if (isDemo) {
      showToast("Demo mode — nothing was sent.");
      onClose();
      return;
    }
    if (!subject.trim() || !body.trim()) {
      showToast("Add a subject and a message", "error");
      return;
    }
    if (selected.size === 0) {
      showToast("Pick at least one client", "error");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("broadcast-email", {
      body: {
        subject: subject.trim(),
        body: body.trim(),
        recipient_ids: [...selected],
        attachment_url: attachmentUrl || undefined,
      },
    });
    setSending(false);

    if (error) {
      showToast("Couldn't send the announcement", "error");
      return;
    }
    const result = { sent: data?.sent ?? 0, skipped: data?.skipped ?? 0 };
    showToast(
      result.skipped > 0
        ? `Sent to ${result.sent} — ${result.skipped} skipped (opted out or no email).`
        : `Sent to ${result.sent} client${result.sent === 1 ? "" : "s"}.`,
    );
    onSent?.(result);
    onClose();
  };

  return (
    <Modal
      title="Send an announcement"
      size="md"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSend} disabled={sending}>
            {sending ? "Sending…" : `Send to ${selected.size}`}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="ann-subject">Subject</label>
          <input
            id="ann-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Practice closed 24–28 December"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="ann-body">Message</label>
          <textarea
            id="ann-body"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message. Blank lines start a new paragraph."
          />
        </div>

        <div className={styles.field}>
          <label>
            Attachment <span className={styles.optional}>(optional PDF)</span>
          </label>
          <PdfUpload adminId={userProfile?.id ?? ""} value={attachmentUrl} onChange={setAttachmentUrl} />
        </div>

        <div className={styles.recipients}>
          <div className={styles.recipientsHeader}>
            <span>Recipients ({selected.size})</span>
            <button type="button" className={styles.linkBtn} onClick={toggleAll}>
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          {sorted.length === 0 ? (
            <p className={styles.empty}>No active clients to message.</p>
          ) : (
            <ul className={styles.list}>
              {sorted.map((c) => (
                <li key={c.id}>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span>{clientDisplayName(c, useCodenames)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className={styles.note}>
          Clients who have opted out of practice emails, or have no email address, are skipped automatically.
        </p>
      </div>
    </Modal>
  );
}
