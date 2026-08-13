import { useState } from "react";

import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";
import type { StubSession } from "@models/globalTypes";

import styles from "./AddStubSessionModal.module.scss";

type Props = {
  stubId: string;
  adminId: string;
  existing?: StubSession | null;
  onClose: () => void;
  onSaved: (sessions: StubSession[]) => void;
};

const STATUS_OPTIONS = [
  { value: "attended", label: "Attended" },
  { value: "scheduled", label: "Scheduled" },
  { value: "no_show", label: "No show" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function AddStubSessionModal({ stubId, adminId, existing = null, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const isEditing = !!existing;

  const [scheduledAt, setScheduledAt] = useState<Dayjs | null>(existing ? dayjs(existing.scheduled_at) : null);
  const [duration, setDuration] = useState(
    existing?.duration_minutes != null ? String(existing.duration_minutes) : "50",
  );
  const [status, setStatus] = useState<StubSession["status"]>(existing?.status ?? "attended");
  const [amount, setAmount] = useState(existing?.amount_paid != null ? String(existing.amount_paid) : "");
  const [currency, setCurrency] = useState(existing?.currency ?? "GBP");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    setError("");

    const payload = {
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: duration ? Number(duration) : null,
      status,
      amount_paid: amount ? Number(amount) : null,
      currency,
      location: location.trim() || null,
      notes: notes.trim() || null,
      code: code.trim() || null,
    };

    if (isEditing && existing) {
      const { data, error: err } = await supabase
        .from("stub_sessions")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (err) {
        setError("Failed to update session.");
        setSaving(false);
        return;
      }
      onSaved([data as StubSession]);
      showToast("Session updated.");
      onClose();
      return;
    }

    const base = scheduledAt;
    const dates = [base];
    if (isRecurring) {
      for (let i = 1; i <= recurringWeeks; i++) {
        dates.push(base.add(i, "week"));
      }
    }

    const rows = dates.map((d) => ({
      stub_id: stubId,
      admin_id: adminId,
      ...payload,
      scheduled_at: d.toISOString(),
    }));

    const { data, error: err } = await supabase.from("stub_sessions").insert(rows).select();
    if (err) {
      setError("Failed to add session.");
      setSaving(false);
      return;
    }

    const saved = data as StubSession[];
    onSaved(saved);
    showToast(saved.length > 1 ? `${saved.length} sessions added.` : "Session added.");
    for (const s of saved) {
      if (s.status === "scheduled") {
        supabase.functions.invoke("notify-stub-session-booked", { body: { stub_session_id: s.id } });
      }
    }
    onClose();
  };

  return (
    <Modal
      title={isEditing ? "Edit session" : "Add session"}
      onClose={onClose}
      size="sm"
      actions={
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!scheduledAt || saving}>
            {(() => {
              if (saving) return isEditing ? "Saving…" : "Adding…";
              if (isEditing) return "Save changes";
              if (isRecurring) return `Schedule ${recurringWeeks + 1} sessions`;
              return "Add session";
            })()}
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Date &amp; time</legend>
          <DateInput mode="datetime" value={scheduledAt} onChange={setScheduledAt} />
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Status</legend>
          <div className={styles.radioGroup}>
            {STATUS_OPTIONS.map(({ value, label }) => (
              <label key={value} className={styles.radioLabel}>
                <input type="radio" name="stub-status" checked={status === value} onChange={() => setStatus(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Duration</legend>
          <div className={styles.inputWrapper}>
            <input
              className={styles.input}
              type="number"
              min={10}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="50"
            />
          </div>
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>
            Session fee <span className={styles.optional}>(optional)</span>
          </legend>
          <div className={styles.amountRow}>
            <select className={styles.currencySelect} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="GBP">£ GBP</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>
            <input
              className={styles.input}
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>
            Location <span className={styles.optional}>(optional)</span>
          </legend>
          <input
            className={styles.input}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. 15 London Rd or Zoom link"
          />
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>
            Reference code <span className={styles.optional}>(optional)</span>
          </legend>
          <input
            className={styles.input}
            type="text"
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. S-001"
          />
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>
            Notes <span className={styles.optional}>(optional)</span>
          </legend>
          <textarea
            className={styles.textarea}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for this session…"
          />
        </fieldset>

        {!isEditing && (
          <>
            <div className={styles.checkboxGroup}>
              <input
                id="stub-recurring"
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <label htmlFor="stub-recurring" className={styles.checkboxLabel}>
                Repeat weekly
              </label>
            </div>

            {isRecurring && (
              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>Additional weeks</legend>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={11}
                  value={recurringWeeks}
                  onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                  style={{ maxWidth: "120px" }}
                />
              </fieldset>
            )}
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
