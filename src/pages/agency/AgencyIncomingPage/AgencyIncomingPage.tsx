import { useEffect, useState } from "react";

import ClientReviewModal from "@components/agency/ClientReviewModal/ClientReviewModal";
import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import Spinner from "@components/shared/Spinner/Spinner";
import { useToast } from "@context/ToastContext";
import type { ClientAssignment } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchIncomingAssignments,
  requestAgencyMemberRemoval,
  selectAgencyMembership,
  selectIncomingAssignments,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import { getErrorMessage } from "@/Helpers/Helpers";
import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

type ReviewAssignment = ClientAssignment & { client_name: string };

export default function AgencyIncomingPage() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const incoming = useAppSelector(selectIncomingAssignments);
  const status = useAppSelector((s) => s.agency.incomingStatus);
  const isManager = useAppSelector(selectIsAgencyManager);
  const membership = useAppSelector(selectAgencyMembership);
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchIncomingAssignments());
  }, [dispatch]);

  const confirmLeave = async () => {
    setLeaveBusy(true);
    try {
      await dispatch(requestAgencyMemberRemoval(leaveReason.trim() || undefined)).unwrap();
      showToast("Sent — the agency's managers have been notified.", "success");
      setLeaving(false);
    } catch (err) {
      showToast(getErrorMessage(err, "Couldn't send your request"), "error");
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <div className="inner">
      <div className={styles.header} id="agency-incoming-header">
        <div>
          <h1 className={styles.title}>Clients to review</h1>
          <p className={styles.subtitle}>
            Intakes your agency has assigned to you. Accept to add them to your caseload.
          </p>
        </div>
      </div>

      {status === "loading" && incoming.length === 0 && (
        <div className={styles.empty}>
          <Spinner size={28} />
        </div>
      )}
      {status !== "loading" && incoming.length === 0 && (
        <p className={styles.empty}>Nothing waiting. New assignments will show up here.</p>
      )}
      {incoming.length > 0 && (
        <div className={styles.list}>
          {incoming.map((a) => (
            <div key={a.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{a.client_name}</span>
                <span className={styles.rowMeta}>
                  {a.rate_pence != null ? `${formatPence(a.rate_pence)} / session` : "Rate not set"}
                  {a.availability_note && ` · ${a.availability_note}`}
                </span>
              </div>
              <div className={styles.rowActions}>
                <Button size="sm" onClick={() => setReviewing(a)}>
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isManager && (
        <div className={styles.card} style={{ marginTop: "var(--sp-5)" }}>
          <h2 className={styles.cardTitle}>Leave this agency</h2>
          {membership?.deletion_requested_at ? (
            <p className={styles.cardBlurb}>
              Request sent {new Date(membership.deletion_requested_at).toLocaleDateString("en-GB")} — an agency manager
              needs to action it. They'll reassign your caseload when they do.
            </p>
          ) : (
            <>
              <p className={styles.cardBlurb}>
                You can't remove yourself — only an agency manager can, so your clients get reassigned properly. This
                sends them a request.
              </p>
              <Button variant="danger" size="sm" onClick={() => setLeaving(true)}>
                Request removal
              </Button>
            </>
          )}
        </div>
      )}

      {reviewing && <ClientReviewModal assignment={reviewing} onClose={() => setReviewing(null)} />}

      {leaving && (
        <ConfirmModal
          title="Request to leave this agency?"
          danger
          confirming={leaveBusy}
          onConfirm={confirmLeave}
          onClose={() => setLeaving(false)}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="leave-reason">
              Reason (optional, shown to managers)
            </label>
            <textarea
              id="leave-reason"
              className={styles.textarea}
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Let them know why, if you'd like."
            />
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
