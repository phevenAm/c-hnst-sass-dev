import { useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { AvailabilityOverride, AvailabilityRule } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createOverride, createRule, deleteOverride, deleteRule } from "@/store/slices/availabilitySlice";
import { DAY_NAMES } from "./schedulerUtils";

import styles from "./AvailabilityEditor.module.scss";

// ============================================================
// AVAILABILITY EDITOR
//
// A modal with two sections:
//   1. Recurring windows  → availability_rules (weekly template)
//   2. Date exceptions    → availability_overrides (blocks + extra windows)
//
// Times are entered as native <input type="time"> ("HH:MM"). The DB
// column is `time`, which accepts "HH:MM" directly.
// ============================================================

type AvailabilityEditorProps = {
  onClose: () => void;
};

function fmtTime(t: string): string {
  // "12:00:00" or "12:00" → "12:00pm"
  return dayjs(`2000-01-01T${t}`).format("h:mma");
}

const AvailabilityEditor = ({ onClose }: AvailabilityEditorProps) => {
  const dispatch = useAppDispatch();
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();

  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);

  // ----- new recurring rule form
  const [ruleDay, setRuleDay] = useState(5); // Friday default
  const [ruleStart, setRuleStart] = useState("12:00");
  const [ruleEnd, setRuleEnd] = useState("16:00");
  const [ruleLabel, setRuleLabel] = useState("");

  // ----- new override form
  const [ovrDate, setOvrDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [ovrBlocked, setOvrBlocked] = useState(true);
  const [ovrStart, setOvrStart] = useState("");
  const [ovrEnd, setOvrEnd] = useState("");
  const [ovrLabel, setOvrLabel] = useState("");

  const demoGuard = (): boolean => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return true;
    }
    return false;
  };

  const handleAddRule = async () => {
    if (demoGuard() || !authUser) return;
    if (ruleEnd <= ruleStart) {
      showToast("End time must be after start time.", "warning");
      return;
    }
    const res = await dispatch(
      createRule({
        admin_id: authUser.id,
        day_of_week: ruleDay,
        start_time: ruleStart,
        end_time: ruleEnd,
        label: ruleLabel.trim() || null,
      }),
    );
    if (createRule.fulfilled.match(res)) {
      setRuleLabel("");
      showToast("Availability added.", "success");
    } else {
      showToast("Couldn't add availability.", "danger");
    }
  };

  const handleAddOverride = async () => {
    if (demoGuard() || !authUser) return;
    // An "add extra window" override requires both times; a block may omit them.
    if (!ovrBlocked && (!ovrStart || !ovrEnd)) {
      showToast("Extra windows need a start and end time.", "warning");
      return;
    }
    if (ovrStart && ovrEnd && ovrEnd <= ovrStart) {
      showToast("End time must be after start time.", "warning");
      return;
    }
    const res = await dispatch(
      createOverride({
        admin_id: authUser.id,
        override_date: ovrDate,
        is_blocked: ovrBlocked,
        start_time: ovrStart || null,
        end_time: ovrEnd || null,
        label: ovrLabel.trim() || null,
      }),
    );
    if (createOverride.fulfilled.match(res)) {
      setOvrLabel("");
      setOvrStart("");
      setOvrEnd("");
      showToast("Exception saved.", "success");
    } else {
      showToast("Couldn't save exception.", "danger");
    }
  };

  const handleDeleteRule = (id: string) => {
    if (demoGuard()) return;
    dispatch(deleteRule(id));
  };

  const handleDeleteOverride = (id: string) => {
    if (demoGuard()) return;
    dispatch(deleteOverride(id));
  };

  // Group recurring rules by weekday for display
  const rulesByDay: Record<number, AvailabilityRule[]> = {};
  rules.forEach((r) => {
    if (!rulesByDay[r.day_of_week]) rulesByDay[r.day_of_week] = [];
    rulesByDay[r.day_of_week].push(r);
  });

  const describeOverride = (o: AvailabilityOverride): string => {
    const date = dayjs(o.override_date).format("ddd D MMM");
    if (o.is_blocked && !o.start_time) return `${date} — blocked all day`;
    const range = o.start_time && o.end_time ? `${fmtTime(o.start_time)}–${fmtTime(o.end_time)}` : "";
    return o.is_blocked ? `${date} — blocked ${range}` : `${date} — extra ${range}`;
  };

  return (
    <Modal
      title="Manage availability"
      onClose={onClose}
      size="md"
      actions={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.editor}>
        {/* ─── Recurring windows ─────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Recurring windows</h3>
          <p className={styles.hint}>
            Your weekly template. Clients can request reschedules into these times, week after week.
          </p>

          {rules.length === 0 ? (
            <p className={styles.empty}>No recurring availability yet.</p>
          ) : (
            <ul className={styles.list}>
              {DAY_NAMES.map((name, dow) =>
                (rulesByDay[dow] ?? []).map((r) => (
                  <li key={r.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <strong>{name}</strong> {fmtTime(r.start_time)}–{fmtTime(r.end_time)}
                      {r.label && <span className={styles.rowLabel}> · {r.label}</span>}
                    </span>
                    <Button size="sm" variant="ghost-danger" onClick={() => handleDeleteRule(r.id)}>
                      Remove
                    </Button>
                  </li>
                )),
              )}
            </ul>
          )}

          <div className={styles.form}>
            <select
              className={styles.input}
              value={ruleDay}
              onChange={(e) => setRuleDay(Number(e.target.value))}
              aria-label="Day of week"
            >
              {DAY_NAMES.map((name, dow) => (
                <option key={name} value={dow}>
                  {name}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              type="time"
              value={ruleStart}
              onChange={(e) => setRuleStart(e.target.value)}
              aria-label="Start time"
            />
            <input
              className={styles.input}
              type="time"
              value={ruleEnd}
              onChange={(e) => setRuleEnd(e.target.value)}
              aria-label="End time"
            />
            <input
              className={styles.input}
              type="text"
              placeholder="Label (optional)"
              value={ruleLabel}
              onChange={(e) => setRuleLabel(e.target.value)}
            />
            <Button size="sm" onClick={handleAddRule}>
              Add
            </Button>
          </div>
        </section>

        {/* ─── Date exceptions ───────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Date exceptions</h3>
          <p className={styles.hint}>
            Block a specific date (holiday) or open an extra one-off window on a date the template doesn't cover.
          </p>

          {overrides.length === 0 ? (
            <p className={styles.empty}>No exceptions.</p>
          ) : (
            <ul className={styles.list}>
              {overrides
                .slice()
                .sort((a, b) => a.override_date.localeCompare(b.override_date))
                .map((o) => (
                  <li key={o.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={o.is_blocked ? styles.blockedDot : styles.openDot} />
                      {describeOverride(o)}
                      {o.label && <span className={styles.rowLabel}> · {o.label}</span>}
                    </span>
                    <Button size="sm" variant="ghost-danger" onClick={() => handleDeleteOverride(o.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
            </ul>
          )}

          <div className={styles.form}>
            <input
              className={styles.input}
              type="date"
              value={ovrDate}
              onChange={(e) => setOvrDate(e.target.value)}
              aria-label="Exception date"
            />
            <select
              className={styles.input}
              value={ovrBlocked ? "block" : "open"}
              onChange={(e) => setOvrBlocked(e.target.value === "block")}
              aria-label="Exception type"
            >
              <option value="block">Block</option>
              <option value="open">Add window</option>
            </select>
            <input
              className={styles.input}
              type="time"
              value={ovrStart}
              onChange={(e) => setOvrStart(e.target.value)}
              aria-label="Exception start time"
              placeholder={ovrBlocked ? "All day" : ""}
            />
            <input
              className={styles.input}
              type="time"
              value={ovrEnd}
              onChange={(e) => setOvrEnd(e.target.value)}
              aria-label="Exception end time"
            />
            <input
              className={styles.input}
              type="text"
              placeholder="Label (optional)"
              value={ovrLabel}
              onChange={(e) => setOvrLabel(e.target.value)}
            />
            <Button size="sm" onClick={handleAddOverride}>
              Add
            </Button>
          </div>
          {ovrBlocked && <p className={styles.hint}>Leave times empty to block the whole day.</p>}
        </section>
      </div>
    </Modal>
  );
};

export default AvailabilityEditor;
