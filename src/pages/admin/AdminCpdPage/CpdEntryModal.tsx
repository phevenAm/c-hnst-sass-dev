import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import type { CpdActivityType, CpdLog } from "./AdminCpdPage";

import styles from "./CpdEntryModal.module.scss";

type Props = {
  initial: CpdLog | null;
  adminId: string;
  nextSessionNumber: number;
  onClose: () => void;
  onSaved: () => void;
};

const ACTIVITY_TYPES: { value: CpdActivityType; label: string }[] = [
  { value: "supervision", label: "Supervision" },
  { value: "training", label: "Training" },
  { value: "reading", label: "Reading" },
  { value: "conference", label: "Conference" },
  { value: "peer_consultation", label: "Peer Consultation" },
  { value: "personal_therapy", label: "Personal Therapy" },
  { value: "other", label: "Other" },
];

const MODES = [
  { value: "remote", label: "Remote" },
  { value: "in_person", label: "In person" },
];

export default function CpdEntryModal({ initial, adminId, nextSessionNumber, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [activityType, setActivityType] = useState<CpdActivityType>(initial?.activity_type ?? "supervision");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().split("T")[0]);
  const [sessionNumber, setSessionNumber] = useState<string>(
    initial?.session_number != null ? String(initial.session_number) : String(nextSessionNumber),
  );
  const [contractCode, setContractCode] = useState(initial?.contract_code ?? "");
  const [mode, setMode] = useState(initial?.mode ?? "remote");
  const [venue, setVenue] = useState(initial?.venue ?? "");
  const [issuesRaised, setIssuesRaised] = useState(initial?.issues_raised ?? "");
  const [supervisorName, setSupervisorName] = useState(initial?.supervisor_name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [durationHours, setDurationHours] = useState<string>(
    initial?.duration_minutes != null ? String(Math.floor(initial.duration_minutes / 60)) : "1",
  );
  const [durationMins, setDurationMins] = useState<string>(
    initial?.duration_minutes != null ? String(initial.duration_minutes % 60) : "0",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Reset session number suggestion when switching to supervision
  useEffect(() => {
    if (!initial && activityType === "supervision") {
      setSessionNumber(String(nextSessionNumber));
    }
  }, [activityType, initial, nextSessionNumber]);

  const isSupervision = activityType === "supervision";

  const handleSave = async () => {
    if (!date) {
      showToast("Date is required", "error");
      return;
    }
    if (isSupervision && !supervisorName.trim()) {
      showToast("Supervisor name is required", "error");
      return;
    }
    if (!isSupervision && !title.trim()) {
      showToast("Title is required", "error");
      return;
    }

    setSaving(true);
    const totalMins = (Number(durationHours) || 0) * 60 + (Number(durationMins) || 0);

    const payload = {
      admin_id: adminId,
      date,
      activity_type: activityType,
      session_number: isSupervision && sessionNumber ? Number(sessionNumber) : null,
      contract_code: isSupervision ? contractCode || null : null,
      mode: isSupervision ? mode || null : null,
      venue: isSupervision ? venue || null : null,
      issues_raised: isSupervision ? issuesRaised || null : null,
      supervisor_name: isSupervision ? supervisorName || null : null,
      title: !isSupervision ? title || null : null,
      provider: !isSupervision ? provider || null : null,
      duration_minutes: totalMins || null,
      notes: notes || null,
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
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
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

          {isSupervision ? (
            <>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="cpd-session-no">Session number</label>
                  <input
                    id="cpd-session-no"
                    type="number"
                    min={1}
                    value={sessionNumber}
                    onChange={(e) => setSessionNumber(e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="cpd-contract">
                    Contract code <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id="cpd-contract"
                    type="text"
                    value={contractCode}
                    onChange={(e) => setContractCode(e.target.value)}
                    placeholder="e.g. SUP-2026-01"
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="cpd-mode">Mode</label>
                  <select id="cpd-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="cpd-venue">
                    Venue <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id="cpd-venue"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. Supervisor's practice"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="cpd-supervisor">Supervisor name</label>
                <input
                  id="cpd-supervisor"
                  type="text"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  placeholder="e.g. Dr. Jane Smith"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="cpd-issues">
                  Issues raised <span className={styles.optional}>(optional)</span>
                </label>
                <textarea
                  id="cpd-issues"
                  rows={3}
                  value={issuesRaised}
                  onChange={(e) => setIssuesRaised(e.target.value)}
                  placeholder="Brief description of what was brought to supervision…"
                />
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

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
