import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
// Reuse the exact same CSS module as SessionCard so stubs look identical.
import styles from "@components/shared/SessionCard/SessionCard.module.scss";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import type { StubSession } from "@models/globalTypes";

interface Props {
  session: StubSession;
  sessionNumber: number;
  stubId: string;
  adminId: string;
  isDemo?: boolean;
  onUpdated: (updated: StubSession) => void;
  onDeleted: (id: string) => void;
}

function currencySymbol(currency: string) {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "£";
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currencySymbol(currency)}${amount.toFixed(2)}`;
  }
}

export default function StubSessionCard({
  session,
  sessionNumber,
  stubId,
  adminId,
  isDemo,
  onUpdated,
  onDeleted,
}: Props) {
  const { showToast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(session.notes ?? "");
  const [editingCode, setEditingCode] = useState(false);
  const [codeText, setCodeText] = useState(session.code ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);
  const [notifyClient, setNotifyClient] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Keep draft text in sync with incoming prop changes (e.g. realtime updates)
  // while the user is NOT actively editing.
  useEffect(() => {
    if (!editingNotes) setNotesText(session.notes ?? "");
  }, [session.notes, editingNotes]);

  useEffect(() => {
    if (!editingCode) setCodeText(session.code ?? "");
  }, [session.code, editingCode]);

  const isCancelled = session.status === "cancelled";
  const isAttended = session.status === "attended";
  const isNoShow = session.status === "no_show";
  const isPaid = session.paid;
  const isPast = dayjs(session.scheduled_at).isBefore(dayjs());

  const handleTogglePaid = async () => {
    if (demoGuard()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("stub_sessions")
      .update({ paid: !isPaid })
      .eq("id", session.id)
      .select()
      .single();
    setSaving(false);
    if (error) showToast("Failed to update.", "danger");
    else onUpdated(data as StubSession);
  };

  const demoGuard = () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return true;
    }
    return false;
  };

  const updateStatus = async (status: StubSession["status"]) => {
    if (demoGuard()) return;
    const { data, error } = await supabase
      .from("stub_sessions")
      .update({ status })
      .eq("id", session.id)
      .select()
      .single();
    if (error) showToast("Failed to update session.", "danger");
    else onUpdated(data as StubSession);
  };

  const handleConfirmCancel = async () => {
    setConfirming(true);
    const { data, error } = await supabase
      .from("stub_sessions")
      .update({ status: "cancelled" })
      .eq("id", session.id)
      .select()
      .single();
    setConfirming(false);
    if (error) {
      showToast("Failed to update session.", "danger");
      return;
    }
    onUpdated(data as StubSession);
    if (notifyClient) {
      supabase.functions.invoke("notify-stub-session-cancelled", { body: { stub_session_id: session.id } });
    }
    setConfirmAction(null);
  };

  const handleConfirmDelete = async () => {
    setConfirming(true);
    const { error } = await supabase.from("stub_sessions").delete().eq("id", session.id);
    setConfirming(false);
    if (error) {
      showToast("Failed to delete session.", "danger");
      return;
    }
    onDeleted(session.id);
    setConfirmAction(null);
  };

  const saveNotes = async () => {
    if (demoGuard()) {
      setEditingNotes(false);
      return;
    }
    const notes = notesText.trim() || null;
    const { data, error } = await supabase
      .from("stub_sessions")
      .update({ notes })
      .eq("id", session.id)
      .select()
      .single();
    if (error) showToast("Failed to save notes.", "danger");
    else onUpdated(data as StubSession);
    setEditingNotes(false);
  };

  const saveCode = async () => {
    if (demoGuard()) {
      setEditingCode(false);
      return;
    }
    const code = codeText.trim() || null;
    const { data, error } = await supabase
      .from("stub_sessions")
      .update({ code })
      .eq("id", session.id)
      .select()
      .single();
    if (error) showToast("Failed to save code.", "danger");
    else onUpdated(data as StubSession);
    setEditingCode(false);
  };

  // Map stub status → card background class
  const cardClass = isCancelled ? styles.sessionItemCancelled : isNoShow ? styles.sessionItemNoShow : "";

  // Map stub status → status badge class
  const badgeClass = isCancelled
    ? styles.statusCancelled
    : isAttended
      ? styles.statusCompleted
      : isNoShow
        ? styles.statusNoShow
        : styles.statusScheduled;

  const statusLabel = {
    scheduled: "Scheduled",
    attended: "Attended",
    no_show: "No Show",
    cancelled: "Cancelled",
  }[session.status];

  return (
    <div className={[styles.sessionItem, cardClass].filter(Boolean).join(" ")}>
      {/* ── Date row ── */}
      <div className={styles.dateRow}>
        <span className={styles.sessionNumber}>#{sessionNumber}</span>
        <p className={styles.date}>{dayjs(session.scheduled_at).format("dddd D MMM YYYY · h:mma")}</p>
      </div>

      {/* ── Meta pills ── */}
      <div className={styles.meta}>
        {session.duration_minutes != null && <span className={styles.duration}>{session.duration_minutes} min</span>}
        <span className={`${styles.badge} ${badgeClass}`}>{statusLabel}</span>
        <span
          className={isPaid ? styles.paidPill : styles.unpaidPill}
          title={isPaid ? formatAmount(session.amount_paid!, session.currency) : "Unpaid"}
        >
          {currencySymbol(session.currency)}
        </span>

        {/* Code badge (inline editable) */}
        {!isCancelled &&
          (editingCode ? (
            <div className={styles.codeEdit}>
              <input
                className={styles.codeInput}
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveCode();
                  if (e.key === "Escape") {
                    setCodeText(session.code ?? "");
                    setEditingCode(false);
                  }
                }}
                autoFocus
                placeholder="e.g. S-001"
                maxLength={20}
              />
              <button type="button" className={styles.codeConfirm} onClick={saveCode}>
                ✓
              </button>
              <button
                type="button"
                className={styles.codeCancel}
                onClick={() => {
                  setCodeText(session.code ?? "");
                  setEditingCode(false);
                }}
              >
                ✕
              </button>
            </div>
          ) : session.code ? (
            <button type="button" className={styles.codeBadge} onClick={() => setEditingCode(true)} title="Edit code">
              {session.code}
            </button>
          ) : (
            <button type="button" className={styles.addCodeBtn} onClick={() => setEditingCode(true)}>
              + code
            </button>
          ))}
      </div>

      {/* ── Location ── */}
      {session.location && (
        <a
          href={
            session.location.startsWith("http")
              ? session.location
              : `https://maps.google.com/?q=${encodeURIComponent(session.location)}`
          }
          target="_blank"
          rel="noreferrer"
          className={styles.locationLink}
        >
          {session.location.startsWith("http") ? "Join meeting" : "Open in Maps"}
        </a>
      )}

      {/* ── Notes (inline editable) ── */}
      {editingNotes ? (
        <div className={styles.notesEditWrap}>
          <textarea
            className={styles.notesEdit}
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveNotes();
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
            <button type="button" className={styles.codeConfirm} onClick={saveNotes}>
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
      )}

      {/* ── Actions ── */}
      <div className={styles.actions}>
        {isCancelled ? (
          <div className={styles.actions_Icons}>
            <div className={styles.desktopActions}>
              <Button size="sm" variant="secondary" onClick={() => updateStatus("scheduled")}>
                Restore
              </Button>
              <Button size="sm" variant="ghost-danger" onClick={() => !demoGuard() && setConfirmAction("delete")}>
                Delete
              </Button>
            </div>
            <div className={styles.mobileActions}>
              <SplitButton
                variant="secondary"
                size="sm"
                primaryLabel="Restore"
                primaryAction={() => updateStatus("scheduled")}
                options={[{ label: "Delete", onClick: () => !demoGuard() && setConfirmAction("delete") }]}
              />
            </div>
          </div>
        ) : (
          <>
            <div className={styles.attendanceGroup}>
              <button
                type="button"
                className={[styles.attendanceBtn, isAttended ? styles.attendanceBtnAttended : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => updateStatus(isAttended ? "scheduled" : "attended")}
              >
                Attended
              </button>
              <button
                type="button"
                className={[styles.attendanceBtn, isNoShow ? styles.attendanceBtnNoShow : ""].filter(Boolean).join(" ")}
                onClick={() => updateStatus(isNoShow ? "scheduled" : "no_show")}
              >
                No Show
              </button>
            </div>
            <div className={styles.actions_Icons}>
              <div className={styles.desktopActions}>
                <Button size="sm" variant="secondary" onClick={handleTogglePaid} disabled={saving}>
                  {isPaid ? "Mark as unpaid" : "Mark as paid"}
                </Button>
                {!isPast && (
                  <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
                    Reschedule
                  </Button>
                )}
                <Button size="sm" variant="ghost-danger" onClick={() => !demoGuard() && setConfirmAction("cancel")}>
                  Cancel
                </Button>
                <Button size="sm" variant="ghost-danger" onClick={() => !demoGuard() && setConfirmAction("delete")}>
                  Delete
                </Button>
              </div>
              <div className={styles.mobileActions}>
                <SplitButton
                  variant="secondary"
                  size="sm"
                  primaryLabel={isPaid ? "Mark as unpaid" : "Mark as paid"}
                  primaryAction={handleTogglePaid}
                  options={[
                    ...(!isPast ? [{ label: "Reschedule", onClick: () => setEditOpen(true) }] : []),
                    { label: "Cancel", onClick: () => !demoGuard() && setConfirmAction("cancel") },
                    { label: "Delete", onClick: () => !demoGuard() && setConfirmAction("delete") },
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {editOpen && (
        <CreateSessionModal
          clientName=""
          session={
            {
              ...session,
              client_id: null,
              location: session.location?.startsWith("http") ? "remote" : "in_person",
              address: session.location ?? "",
              reference_code: session.code,
              price_pence: session.price_pence ?? 0,
              status: "scheduled" as const,
              created_by: adminId,
              attended: null,
              paid_at: null,
              imported_from_stub_id: null,
              manual_payment_status: "none",
              metadata: null,
              send_reminders: false,
              stripe_payment_intent_id: null,
              is_supervision: false,
              supervision_cost_pence: null,
            } as any
          }
          onClose={() => setEditOpen(false)}
          onSave={async (values) => {
            const { data, error } = await supabase
              .from("stub_sessions")
              .update({
                scheduled_at: values.dates[0],
                duration_minutes: values.duration_minutes,
                price_pence: values.price_pence,
                paid: values.paid,
                location: values.address || null,
                notes: values.notes || null,
                code: values.reference_code || null,
              })
              .eq("id", session.id)
              .select()
              .single();
            if (error) throw new Error("Failed to update session.");
            onUpdated(data as StubSession);
          }}
        />
      )}

      {confirmAction === "cancel" && (
        <ConfirmModal
          title="Cancel this session?"
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirmCancel}
          confirming={confirming}
          confirmLabel="Yes, cancel it"
          cancelLabel="Keep it"
          notifyOption={{
            label: "Email the client that this session was cancelled",
            checked: notifyClient,
            onChange: setNotifyClient,
          }}
        >
          <p>Cancel this session on {dayjs(session.scheduled_at).format("dddd D MMM [at] h:mma")}?</p>
        </ConfirmModal>
      )}

      {confirmAction === "delete" && (
        <ConfirmModal
          title="Delete this session?"
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirmDelete}
          confirming={confirming}
          confirmLabel="Yes, delete"
          cancelLabel="No, cancel"
        >
          <p>This action cannot be undone.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
