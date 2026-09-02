import { useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import type { ClientAssignment } from "@models/agency";
import form from "@pages/agency/agency.module.scss";
import { formatPence } from "@pages/agency/agencyFormat";
import { useAppDispatch } from "@store/hooks";
import { respondToAssignment } from "@store/slices/agencySlice";

type ReviewAssignment = ClientAssignment & { client_name: string };

// Shown to the assigned counsellor: the intake a manager handed over, with
// Accept / Decline. Accept moves the client onto their caseload.
export default function ClientReviewModal({
  assignment,
  onClose,
}: {
  assignment: ReviewAssignment;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const respond = async (accept: boolean) => {
    setError("");
    setBusy(true);
    try {
      await dispatch(
        respondToAssignment({
          assignment_id: assignment.id,
          accept,
          decline_reason: accept ? undefined : reason.trim() || undefined,
        }),
      ).unwrap();
      showToast(
        accept
          ? `${assignment.client_name} is now on your caseload.`
          : `${assignment.client_name} sent back to the agency.`,
        accept ? "success" : "neutral",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record your response");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Review ${assignment.client_name}`}
      onClose={onClose}
      actions={
        declining ? (
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>
              Back
            </Button>
            <Button variant="danger" onClick={() => respond(false)} disabled={busy}>
              {busy ? "Sending…" : "Confirm decline"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost-danger" onClick={() => setDeclining(true)} disabled={busy}>
              Decline
            </Button>
            <Button onClick={() => respond(true)} disabled={busy}>
              {busy ? "Accepting…" : "Accept client"}
            </Button>
          </>
        )
      }
    >
      {error && <div className={form.error}>{error}</div>}

      <dl className={form.formGrid} style={{ margin: 0 }}>
        <div className={form.field}>
          <span className={form.label}>Default session rate</span>
          <span>{assignment.rate_pence != null ? formatPence(assignment.rate_pence) : "Not set"}</span>
        </div>
        <div className={form.field}>
          <span className={form.label}>Availability</span>
          <span>{assignment.availability_note || "Not provided"}</span>
        </div>
        <div className={form.field}>
          <span className={form.label}>Intake notes</span>
          <span style={{ whiteSpace: "pre-wrap" }}>{assignment.intake_note || "None"}</span>
        </div>
      </dl>

      {declining && (
        <div className={form.field} style={{ marginTop: "var(--sp-4)" }}>
          <label className={form.label} htmlFor="decline-reason">
            Reason (optional, shared with the manager)
          </label>
          <textarea
            id="decline-reason"
            className={form.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
