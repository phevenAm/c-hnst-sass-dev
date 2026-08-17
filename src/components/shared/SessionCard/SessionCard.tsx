import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import PaymentModal from "@/components/shared/PaymentModal/PaymentModal";
import { downloadAdminSessionIcs } from "@/Helpers/calendarExport";
import { supabase } from "@/lib/supabase.js";
import { Session, SessionBlockMeta, SessionEvent } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectSessionNumberMap, updateSession } from "@/store/slices/sessionsSlice";
import CancelSessionModal from "./CancelSessionModal/CancelSessionModal";
import ClientRescheduleModal from "./ClientRescheduleModal/ClientRescheduleModal";
import CreateSessionModal from "./CreateSessionModal/CreateSessionModal";
import DeleteSessionModal from "./DeleteSessionModal/DeleteSessionModal";
import useSessionCard from "./useSessionCard";

import styles from "./SessionCard.module.scss";

interface SessionCardProps {
  session: Session;
  isDemo?: boolean;
  isAdmin?: boolean;
  clientLabel?: string;
  onNotesClick?: (sessionId: string) => void;
}

export function SessionCard({ session, isDemo, isAdmin, clientLabel, onNotesClick }: SessionCardProps) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isMarkAsPaidOpen, setIsMarkAsPaidOpen] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [openEditSession, setOpenEditSession] = useState(false);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeText, setCodeText] = useState(session.reference_code ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(session.notes ?? "");

  const dispatch = useAppDispatch();
  const sessionNumber = useAppSelector(selectSessionNumberMap).get(session.id);
  const allSessions = useAppSelector((state) => state.sessions.sessions);
  const { showToast } = useToast();
  const { practiceSettings } = useAuth();

  const handleAddToCalendar = () => {
    const totalSessions = session.client_id
      ? allSessions.filter((s) => s.client_id === session.client_id).length
      : undefined;
    downloadAdminSessionIcs(session, {
      clientLabel: clientLabel ?? "Client",
      businessName: practiceSettings?.business_name ?? undefined,
      sessionNumber,
      totalSessions,
      lastNotes: session.notes ?? undefined,
    });
  };

  const handleSaveCode = () => {
    dispatch(updateSession({ id: session.id, reference_code: codeText.trim() || null }));
    setEditingCode(false);
  };

  const handleMarkAsPaid = async () => {
    if (isDemo) return;
    setIsMarkingPaid(true);
    dispatch(updateSession({ id: session.id, paid: true }));
    supabase.functions.invoke("notify-client-payment-claimed", { body: { session_id: session.id } });
    showToast("Payment noted — your counsellor has been notified.", "success");
    setIsMarkingPaid(false);
    setIsMarkAsPaidOpen(false);
  };

  const handleSaveNotes = () => {
    dispatch(updateSession({ id: session.id, notes: notesText.trim() || null }));
    setEditingNotes(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("session_events")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data as SessionEvent[]);
      });
  }, [session.id, isAdmin]);

  const {
    toggleNoShowOrPayment,
    markAttended,
    markNoShow,
    restoreSession,
    getCardClass,
    getStatusClass,
    formatEventLabel,
    isWithin48Hours,
  } = useSessionCard(session);

  const isCancelled = session.status === "cancelled";
  const isPast = dayjs(session.scheduled_at).isBefore(dayjs());

  return (
    <div className={[styles.sessionItem, getCardClass(session.status, session.attended)].filter(Boolean).join(" ")}>
      <div className={styles.dateRow}>
        {sessionNumber !== undefined && <span className={styles.sessionNumber}>#{sessionNumber}</span>}
        <p className={styles.date}>{dayjs(session.scheduled_at).format("dddd D MMM YYYY · h:mma")}</p>
      </div>

      <div className={styles.meta}>
        <span className={styles.duration}>{session.duration_minutes} min</span>
        <span
          className={`${styles.badge} ${getStatusClass(session.status, session.attended, session.paid, session.scheduled_at)}`}
        >
          {session.attended === false ? "No Show" : session.status.replace("_", " ")}
        </span>
        <span
          className={session.paid ? styles.paidPill : styles.unpaidPill}
          title={session.paid ? "Paid" : "Payment pending"}
        >
          £
        </span>
        {session.metadata && (session.metadata as SessionBlockMeta).block_id && (
          <span className={styles.blockBadge} title={`Block ID: ${(session.metadata as SessionBlockMeta).block_id}`}>
            Block {dayjs((session.metadata as SessionBlockMeta).block_start).format("D MMM")} ·{" "}
            {(session.metadata as SessionBlockMeta).block_pos}/{(session.metadata as SessionBlockMeta).block_total}
          </span>
        )}
        {isAdmin &&
          !isCancelled &&
          (editingCode ? (
            <div className={styles.codeEdit}>
              <input
                className={styles.codeInput}
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCode();
                  if (e.key === "Escape") {
                    setCodeText(session.reference_code ?? "");
                    setEditingCode(false);
                  }
                }}
                autoFocus
                placeholder="e.g. S-001"
                maxLength={20}
              />
              <button type="button" className={styles.codeConfirm} onClick={handleSaveCode}>
                ✓
              </button>
              <button
                type="button"
                className={styles.codeCancel}
                onClick={() => {
                  setCodeText(session.reference_code ?? "");
                  setEditingCode(false);
                }}
              >
                ✕
              </button>
            </div>
          ) : session.reference_code ? (
            <button type="button" className={styles.codeBadge} onClick={() => setEditingCode(true)} title="Edit code">
              {session.reference_code}
            </button>
          ) : (
            <button type="button" className={styles.addCodeBtn} onClick={() => setEditingCode(true)}>
              + code
            </button>
          ))}
      </div>

      {session.address && dayjs(session.scheduled_at).isAfter(dayjs()) && (
        <a
          href={
            session.location === "in_person"
              ? `https://maps.google.com/?q=${encodeURIComponent(session.address)}`
              : session.address
          }
          target="_blank"
          rel="noreferrer"
          className={styles.locationLink}
        >
          {session.location === "in_person" ? "Open in Maps" : "Join meeting"}
        </a>
      )}

      {isAdmin &&
        (editingNotes ? (
          <div className={styles.notesEditWrap}>
            <textarea
              className={styles.notesEdit}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveNotes();
                }
                if (e.key === "Escape") {
                  setNotesText(session.notes ?? "");
                  setEditingNotes(false);
                }
              }}
              autoFocus
              rows={3}
              placeholder="Session notes…"
            />
            <div className={styles.notesEditActions}>
              <button type="button" className={styles.codeConfirm} onClick={handleSaveNotes}>
                Save
              </button>
              <button
                type="button"
                className={styles.codeCancel}
                onClick={() => {
                  setNotesText(session.notes ?? "");
                  setEditingNotes(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            className={session.notes ? styles.notes : styles.noNotes}
            onClick={() => setEditingNotes(true)}
            role="button"
            title="Click to edit notes"
          >
            {session.notes ?? "Click to add notes"}
          </p>
        ))}

      <div className={styles.actions}>
        {isAdmin && isCancelled && (
          <div className={styles.actions_Icons}>
            <div className={styles.desktopActions}>
              <Button size="sm" variant="secondary" disabled={isDemo} onClick={restoreSession}>
                Restore
              </Button>
              <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsDeleteModalOpen(true)}>
                Delete
              </Button>
            </div>
            <div className={styles.mobileActions}>
              <SplitButton
                variant="secondary"
                size="sm"
                primaryLabel="Restore"
                primaryAction={restoreSession}
                options={[
                  {
                    label: "Delete",
                    onClick: () => {
                      if (!isDemo) setIsDeleteModalOpen(true);
                    },
                  },
                ]}
              />
            </div>
          </div>
        )}

        {isAdmin && !isCancelled && (
          <>
            <div className={styles.attendanceGroup}>
              <button
                type="button"
                className={[styles.attendanceBtn, session.attended === true ? styles.attendanceBtnAttended : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={markAttended}
              >
                Attended
              </button>
              <button
                type="button"
                className={[styles.attendanceBtn, session.attended === false ? styles.attendanceBtnNoShow : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={markNoShow}
              >
                No Show
              </button>
            </div>
            <div className={styles.actions_Icons}>
              {/* Desktop: all buttons inline */}
              <div className={styles.desktopActions}>
                <Button size="sm" variant="secondary" data-action-type="payment" onClick={toggleNoShowOrPayment}>
                  {session.paid ? "Mark as unpaid" : "Mark as paid"}
                </Button>
                {onNotesClick && (
                  <Button size="sm" variant="secondary" onClick={() => onNotesClick(session.id)}>
                    Notes
                  </Button>
                )}
                {!isPast && (
                  <Button size="sm" variant="secondary" onClick={() => setOpenEditSession(true)}>
                    Reschedule
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={handleAddToCalendar}>
                  Add to calendar
                </Button>
                <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsCancelModalOpen(true)}>
                  Cancel
                </Button>
                <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsDeleteModalOpen(true)}>
                  Delete
                </Button>
              </div>
              {/* Mobile: SplitButton collapses all actions */}
              <div className={styles.mobileActions}>
                <SplitButton
                  variant="secondary"
                  size="sm"
                  primaryLabel={session.paid ? "Mark as unpaid" : "Mark as paid"}
                  primaryAction={() => toggleNoShowOrPayment()}
                  options={[
                    ...(onNotesClick ? [{ label: "Notes", onClick: () => onNotesClick(session.id) }] : []),
                    ...(!isPast ? [{ label: "Reschedule", onClick: () => setOpenEditSession(true) }] : []),
                    { label: "Add to calendar", onClick: handleAddToCalendar },
                    {
                      label: "Cancel",
                      onClick: () => {
                        if (!isDemo) setIsCancelModalOpen(true);
                      },
                    },
                    {
                      label: "Delete",
                      onClick: () => {
                        if (!isDemo) setIsDeleteModalOpen(true);
                      },
                    },
                  ]}
                />
              </div>
            </div>
          </>
        )}

        {!isAdmin && dayjs(session.scheduled_at).isAfter(dayjs()) && !isWithin48Hours && (
          <div className={styles.actions_Icons}>
            {!session.paid ? (
              <SplitButton
                size="sm"
                variant="primary"
                primaryLabel="Pay"
                primaryAction={() => !isDemo && setIsPayModalOpen(true)}
                options={[{ label: "Mark as paid", onClick: () => !isDemo && setIsMarkAsPaidOpen(true) }]}
              />
            ) : null}
            <Button size="sm" variant="secondary" disabled={isDemo} onClick={() => setIsRescheduleModalOpen(true)}>
              Reschedule
            </Button>
            <Button size="sm" variant="ghost-danger" disabled={isDemo} onClick={() => setIsCancelModalOpen(true)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {isAdmin && events.length > 0 && (
        <div className={styles.history}>
          <button type="button" className={styles.historyToggle} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide history" : `History (${events.length})`}
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
      {isMarkAsPaidOpen && (
        <Modal
          title="Mark as paid"
          size="sm"
          onClose={() => setIsMarkAsPaidOpen(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setIsMarkAsPaidOpen(false)} disabled={isMarkingPaid}>
                Cancel
              </Button>
              <Button onClick={handleMarkAsPaid} disabled={isMarkingPaid}>
                {isMarkingPaid ? "Saving…" : "Confirm payment"}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "var(--sp-3)" }}>
            Use this if you've already sent payment by bank transfer or another method and want to let your counsellor
            know.
          </p>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
            Your counsellor will receive a notification to check their bank account. They will confirm receipt and mark
            the session as paid on their end.
          </p>
        </Modal>
      )}
      {isRescheduleModalOpen && (
        <ClientRescheduleModal session={session} onClose={() => setIsRescheduleModalOpen(false)} />
      )}
      {openEditSession && (
        <CreateSessionModal clientId={session.client_id!} session={session} onClose={() => setOpenEditSession(false)} />
      )}
    </div>
  );
}
