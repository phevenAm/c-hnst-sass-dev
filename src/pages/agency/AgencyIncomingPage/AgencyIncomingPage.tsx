import { useEffect, useState } from "react";

import ClientReviewModal from "@components/agency/ClientReviewModal/ClientReviewModal";
import Button from "@components/shared/Button/Button";
import type { ClientAssignment } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { fetchIncomingAssignments, selectIncomingAssignments } from "@store/slices/agencySlice";

import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

type ReviewAssignment = ClientAssignment & { client_name: string };

export default function AgencyIncomingPage() {
  const dispatch = useAppDispatch();
  const incoming = useAppSelector(selectIncomingAssignments);
  const status = useAppSelector((s) => s.agency.incomingStatus);
  const [reviewing, setReviewing] = useState<ReviewAssignment | null>(null);

  useEffect(() => {
    dispatch(fetchIncomingAssignments());
  }, [dispatch]);

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Clients to review</h1>
          <p className={styles.subtitle}>
            Intakes your agency has assigned to you. Accept to add them to your caseload.
          </p>
        </div>
      </div>

      {status === "loading" && incoming.length === 0 && <p className={styles.empty}>Loading…</p>}
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

      {reviewing && <ClientReviewModal assignment={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}
