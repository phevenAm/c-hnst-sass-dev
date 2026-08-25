import { useRef, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import type { CpdActivityType, CpdLog } from "./AdminCpdPage";

import styles from "./CpdEntryModal.module.scss";

type Props = {
  initial: CpdLog | null;
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
};

const ACTIVITY_TYPES: { value: CpdActivityType; label: string }[] = [
  { value: "training", label: "Training" },
  { value: "reading", label: "Reading" },
  { value: "conference", label: "Conference" },
  { value: "other", label: "Other" },
];

export default function CpdEntryModal({ initial, adminId, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { isDemo } = useAuth();
  const [saving, setSaving] = useState(false);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [activityType, setActivityType] = useState<CpdActivityType>(initial?.activity_type ?? "training");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [durationHours, setDurationHours] = useState<string>(
    initial?.duration_minutes != null ? String(Math.floor(initial.duration_minutes / 60)) : "1",
  );
  const [durationMins, setDurationMins] = useState<string>(
    initial?.duration_minutes != null ? String(initial.duration_minutes % 60) : "0",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [customCategory, setCustomCategory] = useState(initial?.custom_category ?? "");

  const handleSave = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }
    if (!date) {
      showToast("Date is required", "error");
      return;
    }
    if (!title.trim()) {
      showToast("Title is required", "error");
      return;
    }

    setSaving(true);
    const totalMins = (Number(durationHours) || 0) * 60 + (Number(durationMins) || 0);

    const payload = {
      admin_id: adminId,
      date,
      activity_type: activityType,
      title: title || null,
      provider: provider || null,
      duration_minutes: totalMins || null,
      notes: notes || null,
      custom_category: activityType === "other" ? customCategory.trim() || null : null,
    };

    const { error } = initial
      ? await supabase.from("cpd_logs").update(payload).eq("id", initial.id)
      : await supabase.from("cpd_logs").insert(payload);

    setSaving(false);
    if (error) {
      showToast("Failed to save entry", "error");
      return;
    }
    showToast(initial ? "Entry updated." : "Entry added.");
    onSaved();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss — modal has an explicit close button
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss — modal has an explicit close button
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        mouseDownTarget.current = e.target;
      }}
      onClick={(e) => {
        if (mouseDownTarget.current === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit CPD entry" : "Add CPD entry"}
      >
        <div className={styles.header}>
          <h2>{initial ? "Edit entry" : "Add CPD entry"}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="cpd-type">Activity type</label>
              <select
                id="cpd-type"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as CpdActivityType)}
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Date</label>
              <DateInput
                mode="date"
                value={date ? dayjs(date) : null}
                onChange={(val) => setDate(val?.format("YYYY-MM-DD") ?? "")}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="cpd-hours">Hours</label>
              <input
                id="cpd-hours"
                type="number"
                min={0}
                max={24}
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="cpd-mins">Minutes</label>
              <select id="cpd-mins" value={durationMins} onChange={(e) => setDurationMins(e.target.value)}>
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "0" : m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activityType === "other" && (
            <div className={styles.field}>
              <label htmlFor="cpd-custom-cat">
                Category name <span className={styles.optional}>(optional — e.g. "Yoga Therapy")</span>
              </label>
              <input
                id="cpd-custom-cat"
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Leave blank to keep as 'Other'…"
              />
            </div>
          )}
          <div className={styles.field}>
            <label htmlFor="cpd-title">Title</label>
            <input
              id="cpd-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Trauma-Informed Practice (BACP)"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="cpd-provider">
              Provider <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="cpd-provider"
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. BACP, Coursera"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cpd-notes">
              Notes <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="cpd-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reflections, learning outcomes…"
            />
          </div>
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add entry"}
          </Button>
        </div>
      </div>
    </div>
  );
}
