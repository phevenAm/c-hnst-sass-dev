import { useEffect, useMemo, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Json } from "@models/database.types";

import { supabase } from "@/lib/supabase";

import styles from "./AutoReplySettings.module.scss";

type OfficeHours = { days: number[]; from: string; to: string; tz: string };

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
};

/**
 * Admin-only. Configures the away / out-of-hours auto-reply clients see when
 * they message the practitioner while they're on holiday or outside office
 * hours. Stored on practice_settings; delivered by the notify-new-message
 * edge function.
 */
export default function AutoReplySettings({ onClose }: { onClose: () => void }) {
  const { userProfile, refreshPracticeSettings } = useAuth();
  const { showToast } = useToast();

  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [awayUntil, setAwayUntil] = useState("");
  const [hoursOn, setHoursOn] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    supabase
      .from("practice_settings")
      .select("msg_autoreply_enabled, msg_autoreply_text, msg_away_until, msg_office_hours")
      .eq("admin_id", userProfile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEnabled(!!data.msg_autoreply_enabled);
          setText(data.msg_autoreply_text ?? "");
          setAwayUntil(data.msg_away_until ?? "");
          const h = data.msg_office_hours as OfficeHours | null;
          if (h?.from) {
            setHoursOn(true);
            setDays(h.days?.length ? h.days : [1, 2, 3, 4, 5]);
            setFrom(h.from);
            setTo(h.to ?? "17:00");
          }
        }
        setLoaded(true);
      });
  }, [userProfile]);

  const canSave = useMemo(() => !enabled || text.trim().length > 0, [enabled, text]);

  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));

  const save = async () => {
    if (!userProfile) return;
    setSaving(true);
    try {
      const officeHours: OfficeHours | null =
        hoursOn && from && to && days.length ? { days, from, to, tz: browserTz() } : null;

      const { error } = await supabase
        .from("practice_settings")
        .update({
          msg_autoreply_enabled: enabled,
          msg_autoreply_text: text.trim() || null,
          msg_away_until: awayUntil || null,
          msg_office_hours: (officeHours as Json) ?? null,
        })
        .eq("admin_id", userProfile.id);
      if (error) throw error;

      await refreshPracticeSettings();
      showToast("Auto-reply settings saved.", "success");
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Message auto-reply"
      onClose={onClose}
      size="md"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !loaded || !canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.toggleRow}>
          <span>
            <strong>Send an automatic reply when I'm away</strong>
            <span className={styles.hint}>
              Clients see this in the thread when they message you outside your hours or during a break. It's delivered
              instantly; you reply properly when you're back.
            </span>
          </span>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        </label>

        <fieldset className={styles.group} disabled={!enabled}>
          <label className={styles.field}>
            <span className={styles.label}>Auto-reply message</span>
            <textarea
              className={styles.textarea}
              rows={3}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Thanks for your message. I'm not available right now but will reply as soon as I can. If this is urgent or an emergency, please see the Help & Support page."
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>On holiday until (optional)</span>
            <div className={styles.inline}>
              <input
                type="date"
                className={styles.input}
                value={awayUntil}
                onChange={(e) => setAwayUntil(e.target.value)}
              />
              {awayUntil && (
                <button type="button" className={styles.clear} onClick={() => setAwayUntil("")}>
                  Clear
                </button>
              )}
            </div>
            <span className={styles.hint}>The auto-reply fires every day up to and including this date.</span>
          </label>

          <label className={styles.toggleRow}>
            <span>
              <strong>Also reply outside office hours</strong>
              <span className={styles.hint}>Between sessions, evenings and weekends — based on the hours below.</span>
            </span>
            <input type="checkbox" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} />
          </label>

          <fieldset className={styles.group} disabled={!hoursOn}>
            <div className={styles.days}>
              {DAYS.map((d) => (
                <label key={d.n} className={`${styles.day} ${days.includes(d.n) ? styles.dayOn : ""}`}>
                  <input type="checkbox" checked={days.includes(d.n)} onChange={() => toggleDay(d.n)} />
                  {d.label}
                </label>
              ))}
            </div>
            <div className={styles.inline}>
              <label className={styles.timeField}>
                <span className={styles.label}>From</span>
                <input type="time" className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className={styles.timeField}>
                <span className={styles.label}>To</span>
                <input type="time" className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <span className={styles.hint}>
              Your working hours. Outside them, clients get the auto-reply. Times use your device's timezone (
              {browserTz()}).
            </span>
          </fieldset>
        </fieldset>
      </div>
    </Modal>
  );
}
