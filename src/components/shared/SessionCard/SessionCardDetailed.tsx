import { useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button";

import PaymentModal from "@/components/shared/PaymentModal/PaymentModal";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session, SessionBlockMeta, SessionEvent } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { updateSession } from "@/store/slices/sessionsSlice";
import CancelSessionModal from "./CancelSessionModal/CancelSessionModal";
import ClientRescheduleModal from "./ClientRescheduleModal/ClientRescheduleModal";
import CreateSessionModal from "./CreateSessionModal/CreateSessionModal";
import DeleteSessionModal from "./DeleteSessionModal/DeleteSessionModal";
import useSessionCard from "./useSessionCard";

import styles from "./SessionCardDetailed.module.scss";

interface SessionCardDetailedProps {
  session: Session;
  isDemo?: boolean;
  isAdmin?: boolean;
}

function historyToggleLabel(loading: boolean, open: boolean): string {
  if (loading) return "Loading…";
  return open ? "Hide history" : "History";
}

function formatSessionDate(session: Session): string {
  const scheduled = dayjs(session.scheduled_at);
  if (scheduled.isSame(dayjs(), "day")) return `Today at ${scheduled.format("h:mma")}`;
  if (scheduled.isSame(dayjs().add(1, "day"), "day")) return `Tomorrow at ${scheduled.format("h:mma")}`;
  return scheduled.format("dddd D MMM YYYY · h:mma");
}

export function SessionCardDetailed({ session, isDemo, isAdmin }: SessionCardDetailedProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [openEditSession, setOpenEditSession] = useState(false);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(session.notes ?? "");

  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  // Fetched on first expand rather than on mount — every SessionCardDetailed
  // on a page (e.g. a client's session list) was firing its own session_events
  // query up front, even though the history is opened rarely.
  const toggleHistory = async () => {
    if (!showHistory && !historyLoaded) {
      setLoadingHistory(true);
      const { data } = await supabase
        .from("session_events")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });
      if (data) setEvents(data as SessionEvent[]);
      setHistoryLoaded(true);
      setLoadingHistory(false);
    }
    setShowHistory((v) => !v);
  };

  const {
    toggleNoShowOrPayment,
    markAttended,
    markNoShow,
    formatEventLabel,
    isWithinRescheduleCutoff,
    rescheduleCutoffMessage,
  } = useSessionCard(session);

  const isPast = dayjs(session.scheduled_at).isBefore(dayjs());
  const isCompleted = isPast && session.attended === true && session.paid === true;
  const isNoShow = session.attended === false;
  const isInPerson = session.location === "in_person";

  function cardClass() {
    if (isCompleted) return styles.sessionItemCompleted;
    if (isNoShow) return styles.sessionItemNoShow;
    if (session.status === "rescheduled") return styles.sessionItemRescheduled;
    return "";
  }

  function statusBadgeClass() {
    if (isNoShow) return styles.statusNoShow;
    if (isCompleted) return styles.statusCompleted;
    switch (session.status) {
      case "cancelled":
        return styles.statusCancelled;
      case "rescheduled":
        return styles.statusRescheduled;
      default:
        return styles.statusScheduled;
    }
  }

  function statusBadgeLabel() {
    if (isNoShow) return "No Show";
    if (isCompleted) return "Completed";
    return session.status.replace("_", " ");
  }

  function attendancePillClass() {
    if (session.attended === true) return [styles.statusPill, styles.statusPillAttended].join(" ");
    if (session.attended === false) return [styles.statusPill, styles.statusPillNoShow].join(" ");
    return [styles.statusPill, styles.statusPillNeutral].join(" ");
  }

  return (
    <div className={[styles.sessionItem, cardClass()].filter(Boolean).join(" ")}>
      {/* ── Header ─────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <p className={styles.date}>{formatSessionDate(session)}</p>
          <div className={styles.meta}>
            <span className={styles.duration}>{session.duration_minutes} min</span>
            {session.metadata && (session.metadata as SessionBlockMeta).block_id && (
              <span className={styles.blockBadge}>
                Block {dayjs((session.metadata as SessionBlockMeta).block_start).format("D MMM")} ·{" "}
                {(session.metadata as SessionBlockMeta).block_pos}/{(session.metadata as SessionBlockMeta).block_total}
              </span>
            )}
          </div>
        </div>
        <span className={`${styles.badge} ${statusBadgeClass()}`}>{statusBadgeLabel()}</span>
      </div>

      {/* ── Map (in-person, upcoming) ──────────────────── */}
      {session.address && !isPast && isInPerson && (
        <div className={styles.mapWrapper}>
          <iframe
            src={`https://maps.google.com/maps?q=${encodeURIComponent(session.address)}&output=embed`}
            className={styles.map}
            title="Session location"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}

      {/* ── Remote link (upcoming only) ────────────────── */}
      {session.address && !isPast && !isInPerson && (
        <a href={session.address} target="_blank" rel="noreferrer" className={styles.locationLink}>
          Join meeting
        </a>
      )}

      {/* ── Notes ─────────────────────────────────────── */}
      {isAdmin && (
        <div className={styles.notesSection}>
          {editingNotes ? (
            <>
              <textarea
                className={styles.notesTextarea}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className={styles.notesActions}>
                <Button
                  size="sm"
                  onClick={() => {
                    dispatch(updateSession({ id: session.id, notes: notesText }));
                    setEditingNotes(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNotesText(session.notes ?? "");
                    setEditingNotes(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.notesDisplay}>
              <p className={session.notes ? styles.notes : styles.noNotes}>{session.notes ?? "No notes added."}</p>
              <button type="button" className={styles.editNotesBtn} onClick={() => setEditingNotes(true)}>
                {session.notes ? "Edit" : "Add notes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Admin actions ─────────────────────────────── */}
      {isAdmin && (
        <div className={styles.adminActions}>
          {isPast ? (
            <>
              <div className={styles.statusRow}>
                <button
                  type="button"
                  className={attendancePillClass()}
                  onClick={session.attended === true ? markNoShow : markAttended}
                >
                  {session.attended === true
                    ? "✓ Attended"
                    : session.attended === false
                      ? "✕ No Show"
                      : "Mark attendance"}
                </button>
                <button
                  type="button"
                  className={[styles.statusPill, session.paid ? styles.statusPillPaid : styles.statusPillNeutral].join(
                    " ",
                  )}
                  data-action-type="payment"
                  onClick={toggleNoShowOrPayment}
                >
                  {session.paid ? "£ Paid" : "£ Unpaid"}
                </button>
              </div>
              <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsDeleteModalOpen(true)}>
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => setOpenEditSession(true)}>
                Reschedule
              </Button>
              <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsDeleteModalOpen(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Client actions ────────────────────────────── */}
      {!isAdmin && !isPast && (
        <div className={styles.clientActions}>
          <Button
            size="sm"
            variant="primary"
            disabled={isDemo || session.paid}
            onClick={() => {
              if (isWithinRescheduleCutoff) {
                showToast(rescheduleCutoffMessage, "warning");
                return;
              }
              setIsPayModalOpen(true);
            }}
          >
            Pay
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isDemo}
            onClick={() => {
              if (isWithinRescheduleCutoff) {
                showToast(rescheduleCutoffMessage, "warning");
                return;
              }
              setIsRescheduleModalOpen(true);
            }}
          >
            Reschedule
          </Button>
          <Button
            size="sm"
            variant="ghost-danger"
            disabled={isDemo}
            onClick={() => {
              if (isWithinRescheduleCutoff) {
                showToast(rescheduleCutoffMessage, "warning");
                return;
              }
              setIsCancelModalOpen(true);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* ── History ───────────────────────────────────── */}
      {isAdmin && (
        <div className={styles.history}>
          <button type="button" className={styles.historyToggle} onClick={toggleHistory} disabled={loadingHistory}>
            {historyToggleLabel(loadingHistory, showHistory)}
          </button>
          {showHistory && (
            <ul className={styles.historyList}>
              {events.map((ev) => (
                <li key={ev.id} className={styles.historyItem}>
                  <span className={styles.historyLabel}>{formatEventLabel(ev)}</span>
                  <span className={styles.historyDate}>{dayjs(ev.created_at).format("D MMM YYYY, h:mma")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isDeleteModalOpen && <DeleteSessionModal id={session.id} onClose={() => setIsDeleteModalOpen(false)} />}
      {isCancelModalOpen && <CancelSessionModal session={session} onClose={() => setIsCancelModalOpen(false)} />}
      {isPayModalOpen && <PaymentModal session={session} onClose={() => setIsPayModalOpen(false)} />}
      {isRescheduleModalOpen && (
        <ClientRescheduleModal session={session} onClose={() => setIsRescheduleModalOpen(false)} />
      )}
      {openEditSession && (
        <CreateSessionModal clientId={session.client_id!} session={session} onClose={() => setOpenEditSession(false)} />
      )}
    </div>
  );
}
