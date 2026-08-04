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

function MeetingIcon({ url }: { url: string }) {
  const shared = { width: 14, height: 14, "aria-hidden": true, style: { flexShrink: 0 } as React.CSSProperties };
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) {
    return (
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#5558AF" />
        <rect x="4" y="4" width="8" height="2" fill="white" />
        <rect x="7" y="4" width="2" height="8" fill="white" />
      </svg>
    );
  }
  if (url.includes("meet.google.com")) {
    return (
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#00AC47" />
        <rect x="2" y="5" width="7" height="6" rx="1" fill="white" />
        <path d="M10 8l4-2.5v5z" fill="white" />
      </svg>
    );
  }
  if (url.includes("zoom.us")) {
    return (
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#2D8CFF" />
        <rect x="2" y="5" width="7" height="6" rx="1" fill="white" />
        <path d="M10 8l4-2.5v5z" fill="white" />
      </svg>
    );
  }
  return (
    <svg {...shared} viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="4" width="9" height="8" rx="1.5" />
      <path d="M11 8l4-2.5v5z" />
    </svg>
  );
}

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
                    <MeetingIcon url={session.address} />
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
