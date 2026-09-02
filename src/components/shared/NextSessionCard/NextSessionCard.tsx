import { useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { formatSessionDate } from "@/Helpers/sessionDate";
import type { Session, SessionBlockMeta } from "@/models/globalTypes";
import CalendarExportModal from "../CalendarExportModal/CalendarExportModal";
import PaymentModal from "../PaymentModal/PaymentModal";
import ClientCancelModal from "../SessionCard/ClientCancelModal/ClientCancelModal";
import ClientRescheduleModal from "../SessionCard/ClientRescheduleModal/ClientRescheduleModal";
import useSessionCard from "../SessionCard/useSessionCard";

import styles from "./NextSessionCard.module.scss";

function MeetingIcon({ url }: { url: string }) {
  const shared = { width: 14, height: 14, "aria-hidden": true, style: { flexShrink: 0 } as React.CSSProperties };
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) {
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: decorative — aria-hidden is in the `shared` spread
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#5558AF" />
        <rect x="4" y="4" width="8" height="2" fill="white" />
        <rect x="7" y="4" width="2" height="8" fill="white" />
      </svg>
    );
  }
  if (url.includes("meet.google.com")) {
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: decorative — aria-hidden is in the `shared` spread
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#00AC47" />
        <rect x="2" y="5" width="7" height="6" rx="1" fill="white" />
        <path d="M10 8l4-2.5v5z" fill="white" />
      </svg>
    );
  }
  if (url.includes("zoom.us")) {
    return (
      // biome-ignore lint/a11y/noSvgWithoutTitle: decorative — aria-hidden is in the `shared` spread
      <svg {...shared} viewBox="0 0 16 16">
        <rect width="16" height="16" rx="3" fill="#2D8CFF" />
        <rect x="2" y="5" width="7" height="6" rx="1" fill="white" />
        <path d="M10 8l4-2.5v5z" fill="white" />
      </svg>
    );
  }
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative — aria-hidden is in the `shared` spread
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
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);

  const { showToast } = useToast();
  const { isWithinRescheduleCutoff, rescheduleCutoffMessage } = useSessionCard(session);
  const { isDemo, allowBlockSessionCancellation } = useAuth();

  const isOnline = session.location !== "in_person";
  // Defence in depth — callers are expected to filter cancelled sessions out
  // before picking a "next session" to feature, but a cancelled session has
  // no valid Pay/Reschedule/Cancel action regardless of how it got here.
  const isCancelled = session.status === "cancelled";

  const guardAction = (fn: () => void) => {
    if (isWithinRescheduleCutoff) {
      showToast(rescheduleCutoffMessage, "warning");
      return;
    }
    fn();
  };

  // Two reasons an individual session in a block can't be cancelled: the
  // practice has turned block-session cancellation off, or the block is
  // already paid up front. request-cancel-session enforces both server-side —
  // this just skips the round trip so the client sees why immediately.
  const handleCancelClick = () => {
    const blockMeta = session.metadata as SessionBlockMeta | null;
    if (blockMeta?.block_id && allowBlockSessionCancellation === false) {
      showToast(
        "Sessions that are part of a block can't be cancelled individually — contact your therapist.",
        "danger",
      );
      return;
    }
    if (blockMeta?.block_id && session.paid) {
      showToast(
        "This session is part of a paid block and can't be cancelled individually — contact your therapist.",
        "danger",
      );
      return;
    }
    guardAction(() => setIsCancelModalOpen(true));
  };

  return (
    <>
      <Card className={styles.nextStrip}>
        <div className={styles.stripLeft}>
          <div className={styles.stripDateRow}>
            <p className={styles.stripDate}>{formatSessionDate(session.scheduled_at)}</p>
            {isCancelled ? (
              <Badge variant="neutral">Cancelled</Badge>
            ) : (
              <Badge variant={session.paid ? "success" : "warning"}>{session.paid ? "Paid" : "Unpaid"}</Badge>
            )}
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
              <Button size="sm" variant="secondary" onClick={() => setIsCalendarModalOpen(true)}>
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
              {/* Desktop — every action gets its own button */}
              <div className={styles.fullActions}>
                {!isCancelled && (
                  <Button size="sm" variant="secondary" onClick={() => setIsCalendarModalOpen(true)}>
                    Add to calendar
                  </Button>
                )}
                {!session.paid && !isCancelled && (
                  <Button size="sm" variant="primary" disabled={isDemo} onClick={() => setIsPayModalOpen(true)}>
                    Pay
                  </Button>
                )}
                {!isCancelled && (
                  <SplitButton
                    size="sm"
                    variant="secondary"
                    primaryLabel="Reschedule"
                    primaryAction={() => !isDemo && guardAction(() => setIsRescheduleModalOpen(true))}
                    options={[{ label: "Cancel", onClick: () => !isDemo && handleCancelClick() }]}
                  />
                )}
              </div>

              {/* Mobile / tablet — collapse Pay/Reschedule/Cancel into one split button */}
              <div className={styles.compactActions}>
                {!isCancelled && (
                  <Button size="sm" variant="secondary" onClick={() => setIsCalendarModalOpen(true)}>
                    Add to calendar
                  </Button>
                )}
                {!isCancelled && (
                  <SplitButton
                    size="sm"
                    variant={session.paid ? "secondary" : "primary"}
                    primaryLabel={session.paid ? "Reschedule" : "Pay"}
                    primaryAction={() =>
                      !isDemo &&
                      (session.paid ? guardAction(() => setIsRescheduleModalOpen(true)) : setIsPayModalOpen(true))
                    }
                    options={
                      session.paid
                        ? [{ label: "Cancel", onClick: () => !isDemo && handleCancelClick() }]
                        : [
                            {
                              label: "Reschedule",
                              onClick: () => !isDemo && guardAction(() => setIsRescheduleModalOpen(true)),
                            },
                            { label: "Cancel", onClick: () => !isDemo && handleCancelClick() },
                          ]
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {isCalendarModalOpen && <CalendarExportModal session={session} onClose={() => setIsCalendarModalOpen(false)} />}

      {!compact && (
        <>
          {isPayModalOpen && <PaymentModal session={session} onClose={() => setIsPayModalOpen(false)} />}
          {isRescheduleModalOpen && (
            <ClientRescheduleModal session={session} onClose={() => setIsRescheduleModalOpen(false)} />
          )}
          {isCancelModalOpen && <ClientCancelModal session={session} onClose={() => setIsCancelModalOpen(false)} />}
        </>
      )}
    </>
  );
}
