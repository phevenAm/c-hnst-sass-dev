import { useState } from "react";

import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { AdminPrivateEvent } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { createPrivateEvent, deletePrivateEvent, updatePrivateEvent } from "@/store/slices/adminPrivateEventsSlice";

import styles from "./PrivateEventModal.module.scss";

// ============================================================
// PRIVATE EVENT MODAL
//
// Create / edit / delete an admin-only private calendar block. Passing an
// `event` opens it in edit mode; omitting it (null) is a fresh create with
// sensible defaults (next hour, 60 min duration).
// ============================================================

type PrivateEventModalProps = {
  event?: AdminPrivateEvent | null;
  onClose: () => void;
  // Seed the start time for a new event (the scheduler's click-an-empty-slot
  // flow). Ignored in edit mode, where the event's own start wins.
  initialStart?: Dayjs | null;
};

const nextHour = () => dayjs().add(1, "hour").minute(0).second(0).millisecond(0);

const PrivateEventModal = ({ event, onClose, initialStart = null }: PrivateEventModalProps) => {
  const dispatch = useAppDispatch();
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();

  const isEdit = Boolean(event);

  const [title, setTitle] = useState(event?.title ?? "");
  const [startsAt, setStartsAt] = useState<Dayjs | null>(event ? dayjs(event.starts_at) : (initialStart ?? nextHour()));
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    if (!event) return 60;
    return Math.max(1, Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000));
  });
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [isSupervision, setIsSupervision] = useState(event?.is_supervision ?? false);
  const [isCpd, setIsCpd] = useState(event?.is_cpd ?? false);
  const [cost, setCost] = useState(event?.cost_pence != null ? (event.cost_pence / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(event?.currency ?? "GBP");
  const [isSaving, setIsSaving] = useState(false);

  const demoGuard = (): boolean => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return true;
    }
    return false;
  };

  const handleSave = async () => {
    if (demoGuard() || !authUser) return;
    if (!title.trim()) {
      showToast("Give the event a title.", "warning");
      return;
    }
    if (!startsAt) {
      showToast("Set a start time.", "warning");
      return;
    }
    if (!durationMinutes || durationMinutes < 1) {
      showToast("Duration must be at least 1 minute.", "warning");
      return;
    }

    setIsSaving(true);
    const fields = {
      title: title.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: startsAt.add(durationMinutes, "minute").toISOString(),
      notes: notes.trim() || null,
      is_supervision: isSupervision,
      is_cpd: isCpd,
      cost_pence: isSupervision && cost ? Math.round(parseFloat(cost) * 100) : null,
      currency,
    };

    const res =
      isEdit && event
        ? await dispatch(updatePrivateEvent({ id: event.id, ...fields }))
        : await dispatch(createPrivateEvent({ admin_id: authUser.id, ...fields }));

    const ok = isEdit ? updatePrivateEvent.fulfilled.match(res) : createPrivateEvent.fulfilled.match(res);
    if (ok) {
      showToast(isEdit ? "Private event updated." : "Private event added.", "success");
      onClose();
    } else {
      showToast("Couldn't save the event.", "danger");
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (demoGuard() || !event) return;
    const res = await dispatch(deletePrivateEvent(event.id));
    if (deletePrivateEvent.fulfilled.match(res)) {
      showToast("Private event removed.");
      onClose();
    } else {
      showToast("Couldn't remove the event.", "danger");
    }
  };

  return (
    <Modal
      title={isEdit ? "Edit private event" : "Add private event"}
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : isEdit ? "Save" : "Add event"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
          {isEdit && (
            <Button variant="ghost-danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.form}>
        <p className={styles.hint}>Private events show only on your schedule. Clients never see them.</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="private-title">
            Title
          </label>
          <input
            id="private-title"
            className={styles.input}
            type="text"
            placeholder="e.g. Supervision"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.times}>
          <div className={styles.field}>
            <span className={styles.label}>Starts</span>
            <DateInput mode="datetime" value={startsAt} onChange={setStartsAt} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="private-duration">
              Duration (minutes)
            </label>
            <input
              id="private-duration"
              className={styles.input}
              type="number"
              min={1}
              max={480}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="private-notes">
            Notes (optional)
          </label>
          <textarea
            id="private-notes"
            className={styles.textarea}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={isSupervision} onChange={(e) => setIsSupervision(e.target.checked)} />
          Add to supervision log
        </label>

        {isSupervision && (
          <div className={styles.feeRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="private-currency">
                Fee (optional)
              </label>
              <div className={styles.costRow}>
                <select
                  id="private-currency"
                  className={styles.select}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="GBP">£</option>
                  <option value="EUR">€</option>
                  <option value="USD">$</option>
                </select>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={0.01}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={isCpd} onChange={(e) => setIsCpd(e.target.checked)} />
          Add to CPD log
        </label>
      </div>
    </Modal>
  );
};

export default PrivateEventModal;
