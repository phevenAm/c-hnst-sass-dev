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
// sensible defaults (next hour, one hour long).
// ============================================================

type PrivateEventModalProps = {
  event?: AdminPrivateEvent | null;
  onClose: () => void;
};

const nextHour = () => dayjs().add(1, "hour").minute(0).second(0).millisecond(0);

const PrivateEventModal = ({ event, onClose }: PrivateEventModalProps) => {
  const dispatch = useAppDispatch();
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();

  const isEdit = Boolean(event);

  const [title, setTitle] = useState(event?.title ?? "");
  const [startsAt, setStartsAt] = useState<Dayjs | null>(event ? dayjs(event.starts_at) : nextHour());
  const [endsAt, setEndsAt] = useState<Dayjs | null>(event ? dayjs(event.ends_at) : nextHour().add(1, "hour"));

  const [notes, setNotes] = useState(event?.notes ?? "");
  const [isSupervision, setIsSupervision] = useState(event?.is_supervision ?? false);
  const [isCpd, setIsCpd] = useState(event?.is_cpd ?? false);
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
    if (!startsAt || !endsAt) {
      showToast("Set a start and end time.", "warning");
      return;
    }
    if (!endsAt.isAfter(startsAt)) {
      showToast("End time must be after the start time.", "warning");
      return;
    }

    setIsSaving(true);
    const fields = {
      title: title.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: notes.trim() || null,
      is_supervision: isSupervision,
      is_cpd: isCpd,
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
            <span className={styles.label}>Ends</span>
            <DateInput mode="datetime" value={endsAt} onChange={setEndsAt} />
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

        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={isCpd} onChange={(e) => setIsCpd(e.target.checked)} />
          Add to CPD log
        </label>
      </div>
    </Modal>
  );
};

export default PrivateEventModal;
