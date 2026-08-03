import { useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { downloadSessionIcs } from "@/Helpers/calendarExport";
import { formatSessionDate } from "@/Helpers/sessionDate";
import type { Session } from "@/models/globalTypes";
import PaymentModal from "../PaymentModal/PaymentModal";
import CancelSessionModal from "../SessionCard/CancelSessionModal/CancelSessionModal";
import ClientRescheduleModal from "../SessionCard/ClientRescheduleModal/ClientRescheduleModal";
import useSessionCard from "../SessionCard/useSessionCard";

import styles from "./NextSessionCard.module.scss";

interface NextSessionCardProps {
  session: Session;
  /** Dashboard variant — badge + a "View" link only, no action buttons or modals. */
  compact?: boolean;
}

export default function NextSessionCard({ session, compact }: NextSessionCardProps) {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const { showToast } = useToast();
  const { isWithin48Hours } = useSessionCard(session);
  const { isDemo } = useAuth();

  const isOnline = session.location !== "in_person";

  const guardAction = (fn: () => void) => {
    if (isWithin48Hours) {
      showToast("Sessions cannot be changed within 48 hours of the appointment", "warning");
      return;
    }
    fn();
  };

  return (
    <>
      <Card className={styles.nextStrip}>
        <div className={styles.stripLeft}>
          <div className={styles.stripDateRow}>
            <p className={styles.stripDate}>{formatSessionDate(session.scheduled_at)}</p>
            <Badge variant={session.paid ? "success" : "warning"}>{session.paid ? "Paid" : "Unpaid"}</Badge>
          </div>
          <div className={styles.stripMeta}>
            <span>{session.duration_minutes} min</span>
            <span>·</span>
            <span>{isOnline ? "Online" : "In person"}</span>
            {session.address && (
              <>
                <span>·</span>
                {isOnline ? (
                  <a href={session.address} target="_blank" rel="noreferrer" className={styles.joinLink}>
                    Join meeting
                  </a>
                ) : (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(session.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.joinLink}
                  >
                    {session.address}
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.stripRight}>
          {compact ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => downloadSessionIcs(session)}>
                Add to calendar
              </Button>
              <Link to="/my-sessions" style={{ textDecoration: "none" }}>
                <Button size="sm" variant="secondary">
                  View
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => downloadSessionIcs(session)}>
                Add to calendar
              </Button>
              {!session.paid && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={isDemo}
                  onClick={() => guardAction(() => setIsPayModalOpen(true))}
                >
                  Pay
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={isDemo}
                onClick={() => guardAction(() => setIsRescheduleModalOpen(true))}
              >
                Reschedule
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={isDemo}
                onClick={() => guardAction(() => setIsCancelModalOpen(true))}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </Card>

      {!compact && (
        <>
          {isPayModalOpen && <PaymentModal session={session} onClose={() => setIsPayModalOpen(false)} />}
          {isRescheduleModalOpen && (
            <ClientRescheduleModal session={session} onClose={() => setIsRescheduleModalOpen(false)} />
          )}
          {isCancelModalOpen && <CancelSessionModal session={session} onClose={() => setIsCancelModalOpen(false)} />}
        </>
      )}
    </>
  );
}
