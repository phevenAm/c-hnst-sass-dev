import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useEncryption } from "@context/EncryptionContext";
import { supabase } from "@lib/supabase";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { deleteOwnAccount } from "@store/slices/userDirectorySlice";

type DeleteUserModalProps = {
  onClose: () => void;
};

// Turns a base64 zip payload from export-practice-archive into a file the
// browser downloads. Kept tiny + inline — it's the only consumer.
function downloadBase64Zip(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DeleteUserModal({ onClose }: DeleteUserModalProps) {
  const dispatch = useAppDispatch();
  const { signOut, userProfile, isAdmin } = useAuth();
  const { status: encryptionStatus, decryptNote } = useEncryption();
  const businessName = useAppSelector((s) => s.practiceSettings.data?.business_name ?? "");

  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Admin-only: a two-step flow so account deletion (permanent, no grace
  // period) can't be a single mis-click, and so we can push the export at
  // them first. Clients keep the original one-step "close account".
  const [step, setStep] = useState<"intro" | "confirm">("intro");
  const [exporting, setExporting] = useState(false);
  const [exportedName, setExportedName] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  // Fall back to a fixed word if the practice was never named.
  const confirmPhrase = businessName.trim() || "DELETE";
  const phraseMatches = typed.trim().toLowerCase() === confirmPhrase.toLowerCase();

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // Session notes are encrypted in the browser — the edge function can't
      // read them. Decrypt whatever this device holds the key for and hand the
      // plaintext over as a { [noteId]: text } map; the rest stay placeholders.
      const decrypted_notes: Record<string, string> = {};
      if (encryptionStatus === "unlocked") {
        try {
          const { data: rows } = await supabase
            .from("session_notes")
            .select("id, content, note_iv, is_encrypted")
            .eq("admin_id", userProfile?.id ?? "");
          for (const n of rows ?? []) {
            if (!n.is_encrypted || !n.note_iv) continue;
            try {
              decrypted_notes[n.id] = await decryptNote(n.content, n.note_iv);
            } catch {
              /* one note failed to decrypt — leave it as a placeholder */
            }
          }
        } catch {
          /* couldn't load notes — export still runs, notes just stay locked */
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke("export-practice-archive", {
        body: { decrypted_notes },
      });
      if (fnError || !data?.data_base64) throw fnError ?? new Error("No export data returned");
      downloadBase64Zip(data.data_base64, data.filename ?? "clarity-export.zip");
      setExportedName(data.filename ?? "clarity-export.zip");
    } catch (err) {
      console.error("Practice export failed", err);
      setExportError("Couldn't build the export. Try again, or contact support before deleting.");
    } finally {
      setExporting(false);
    }
  };

  const handleDeletion = async () => {
    setDeleting(true);
    try {
      // Admins may have an active Stripe subscription and/or Connect account
      // — delete_own_account() only touches our own DB, so without this
      // Stripe would keep billing a deleted account indefinitely. Best-effort:
      // a Stripe hiccup here shouldn't trap someone who wants their account
      // gone, so we log and proceed rather than block on it.
      if (isAdmin) {
        const { data, error: fnError } = await supabase.functions.invoke("cancel-billing-before-delete");
        if (fnError || (data && !data.success)) {
          console.error("Failed to cancel billing before account deletion", fnError ?? data?.errors);
        }
      }
      await dispatch(deleteOwnAccount(userProfile?.id ?? "")).unwrap();
      await signOut();
    } catch (err) {
      console.error("Failed to delete user", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  // ── Client: unchanged single-step close ──────────────────────────────
  if (!isAdmin) {
    return (
      <Modal
        title="Close your account?"
        onClose={onClose}
        actions={
          <>
            <Button variant="primary" onClick={onClose} aria-label="cancel user deletion" disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeletion} aria-label="confirm user deletion" disabled={deleting}>
              {deleting ? "Closing…" : "Close account"}
            </Button>
          </>
        }
      >
        <p>
          Your login and personal details (name, date of birth, profile photo, email) will be removed immediately and
          you won't be able to sign in again.
        </p>
        <p>
          Your practitioner keeps an anonymised record of your sessions and payments — identified only by a codename,
          not your name — for as long as their professional guidelines require them to. This can't be undone.
        </p>
        {error && <p style={{ color: "var(--error)", marginTop: "0.5rem" }}>{error}</p>}
      </Modal>
    );
  }

  // ── Admin step 1: what deletion means + steer toward pausing ─────────
  if (step === "intro") {
    return (
      <Modal
        title="Delete your account forever?"
        onClose={onClose}
        actions={
          <>
            <Button variant="primary" onClick={onClose} aria-label="cancel user deletion" disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setStep("confirm")} aria-label="continue to delete confirmation">
              Continue
            </Button>
          </>
        }
      >
        <p>
          Deleting your account is <strong>permanent and immediate</strong>. It erases your profile, your practice
          settings and subscription, and <strong>every client record</strong> in your practice — sessions, attendance,
          payments and session notes. There's no grace period and we can't recover any of it.
        </p>
        <p>
          Your Stripe subscription is cancelled at the same time. On the next screen you can download a full copy of
          your practice before anything is deleted.
        </p>
        <p style={{ color: "var(--text-secondary)" }}>
          If you've just stopped practising and might want your records later,{" "}
          <strong>pause your practice instead</strong> (Settings → Billing). Pausing keeps everything, stops your
          billing, and locks the app to read-only until you resume.
        </p>
        {error && <p style={{ color: "var(--error)", marginTop: "0.5rem" }}>{error}</p>}
      </Modal>
    );
  }

  // ── Admin step 2: export, then type-to-confirm ──────────────────────
  return (
    <Modal
      title="Delete your account forever?"
      onClose={onClose}
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => setStep("intro")}
            aria-label="back to delete warning"
            disabled={deleting}
          >
            Back
          </Button>
          <Button
            variant="danger"
            onClick={handleDeletion}
            aria-label="confirm user deletion"
            disabled={deleting || !phraseMatches}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </Button>
        </>
      }
    >
      <section style={{ marginBottom: "1rem" }}>
        <p style={{ marginTop: 0 }}>
          <strong>1. Download a full copy</strong> — clients and their codenames, sessions, attendance, session notes,
          and every payment (each paid session, not just manually-logged ones), as a spreadsheet and a matching PDF.
        </p>
        <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting || deleting}>
          {exporting ? "Preparing…" : exportedName ? "Download again" : "Export my data"}
        </Button>
        {exportedName && (
          <p style={{ color: "var(--success, var(--accent))", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            Downloaded {exportedName}. Store it somewhere safe.
          </p>
        )}
        {exportError && <p style={{ color: "var(--error)", fontSize: "0.9rem", marginTop: "0.4rem" }}>{exportError}</p>}
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          {encryptionStatus === "unlocked"
            ? "Encrypted notes this device can read are decrypted and included; any it can't unlock are written as placeholders."
            : "Your notes are locked, so they'll export as placeholders. Unlock encryption first if you need the note text in the file."}
        </p>
      </section>

      <section>
        <label htmlFor="delete-confirm-phrase">
          <strong>
            2. Type {businessName.trim() ? `your practice name (${businessName.trim()})` : `"${confirmPhrase}"`}
          </strong>{" "}
          to confirm.
        </label>
        <input
          id="delete-confirm-phrase"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          disabled={deleting}
          style={{ display: "block", width: "100%", marginTop: "0.4rem", padding: "0.5rem" }}
        />
      </section>

      {error && <p style={{ color: "var(--error)", marginTop: "0.5rem" }}>{error}</p>}
    </Modal>
  );
}
