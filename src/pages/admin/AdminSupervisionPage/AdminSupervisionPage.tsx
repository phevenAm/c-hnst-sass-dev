import { useCallback, useEffect, useRef, useState } from "react";

import dayjs from "dayjs";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import DateInput from "@components/shared/DateInput/DateInput";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";

import styles from "./AdminSupervisionPage.module.scss";

// ── Types ──────────────────────────────────────────────────────

type ManualRow = {
  id: string;
  date: string;
  supervisor_name: string | null;
  duration_minutes: number | null;
  cost_pence: number | null;
  currency: string;
  mode: string | null;
  session_number: number | null;
  contract_code: string | null;
  issues_raised: string | null;
  venue: string | null;
  notes: string | null;
  track_as_cpd: boolean;
  created_at: string;
};

type CalendarRow = {
  id: string;
  scheduled_at: string;
  supervisor_name: string | null;
  duration_minutes: number | null;
  supervision_cost_pence: number | null;
  currency?: string;
  notes: string | null;
};

type Entry = {
  id: string;
  source: "manual" | "calendar";
  sourceTable: "supervision_sessions" | "sessions" | "admin_private_events";
  date: string;
  supervisorName: string | null;
  durationMinutes: number | null;
  costPence: number | null;
  currency: string;
  mode: string | null;
  sessionNumber: number | null;
  contractCode: string | null;
  issuesRaised: string | null;
  venue: string | null;
  notes: string | null;
  trackAsCpd: boolean;
  raw: ManualRow | null;
};

type FormState = {
  date: string;
  supervisor_name: string;
  duration_hours: string;
  duration_mins: string;
  cost: string;
  currency: string;
  mode: string;
  session_number: string;
  contract_code: string;
  issues_raised: string;
  venue: string;
  notes: string;
  track_as_cpd: boolean;
};

const EMPTY_FORM: FormState = {
  date: dayjs().format("YYYY-MM-DD"),
  supervisor_name: "",
  duration_hours: "1",
  duration_mins: "0",
  cost: "",
  currency: "GBP",
  mode: "remote",
  session_number: "",
  contract_code: "",
  issues_raised: "",
  venue: "",
  notes: "",
  track_as_cpd: false,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(mins: number | null) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtCost(pence: number | null, currency: string) {
  if (pence == null) return "—";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

// ── Add/Edit modal ─────────────────────────────────────────────

function SupervisionModal({
  initial,
  adminId,
  nextSessionNumber,
  onClose,
  onSaved,
}: {
  initial: ManualRow | null;
  adminId: string;
  nextSessionNumber: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const mouseDownTarget = useRef<EventTarget | null>(null);
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          date: initial.date,
          supervisor_name: initial.supervisor_name ?? "",
          duration_hours: initial.duration_minutes != null ? String(Math.floor(initial.duration_minutes / 60)) : "1",
          duration_mins: initial.duration_minutes != null ? String(initial.duration_minutes % 60) : "0",
          cost: initial.cost_pence != null ? (initial.cost_pence / 100).toFixed(2) : "",
          currency: initial.currency,
          mode: initial.mode ?? "remote",
          session_number: initial.session_number != null ? String(initial.session_number) : "",
          contract_code: initial.contract_code ?? "",
          issues_raised: initial.issues_raised ?? "",
          venue: initial.venue ?? "",
          notes: initial.notes ?? "",
          track_as_cpd: initial.track_as_cpd,
        }
      : { ...EMPTY_FORM, session_number: String(nextSessionNumber) },
  );

  const set = (key: keyof FormState, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.supervisor_name.trim()) {
      showToast("Supervisor name is required", "error");
      return;
    }
    if (!form.date) {
      showToast("Date is required", "error");
      return;
    }
    setSaving(true);
    const totalMins = (Number(form.duration_hours) || 0) * 60 + (Number(form.duration_mins) || 0);
    const payload = {
      admin_id: adminId,
      date: form.date,
      supervisor_name: form.supervisor_name.trim(),
      duration_minutes: totalMins || null,
      cost_pence: form.cost ? Math.round(parseFloat(form.cost) * 100) : null,
      currency: form.currency,
      mode: form.mode || null,
      session_number: form.session_number ? Number(form.session_number) : null,
      contract_code: form.contract_code.trim() || null,
      issues_raised: form.issues_raised.trim() || null,
      venue: form.venue.trim() || null,
      notes: form.notes.trim() || null,
      track_as_cpd: form.track_as_cpd,
    };

    const { error } = initial
      ? await supabase.from("supervision_sessions").update(payload).eq("id", initial.id)
      : await supabase.from("supervision_sessions").insert(payload);

    setSaving(false);
    if (error) {
      showToast("Failed to save entry", "error");
      return;
    }
    showToast(initial ? "Entry updated." : "Session added.");
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
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>{initial ? "Edit supervision" : "Add supervision session"}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Supervisor name</label>
              <input
                type="text"
                value={form.supervisor_name}
                onChange={(e) => set("supervisor_name", e.target.value)}
                placeholder="e.g. Dr. Jane Smith"
              />
            </div>
            <div className={styles.field}>
              <label>Date</label>
              <DateInput
                mode="date"
                value={form.date ? dayjs(form.date) : null}
                onChange={(val) => set("date", val?.format("YYYY-MM-DD") ?? "")}
              />
            </div>
          </div>

          <div className={styles.row3}>
            <div className={styles.field}>
              <label>Hours</label>
              <input
                type="number"
                min={0}
                max={24}
                value={form.duration_hours}
                onChange={(e) => set("duration_hours", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Minutes</label>
              <select value={form.duration_mins} onChange={(e) => set("duration_mins", e.target.value)}>
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "0" : m}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Mode</label>
              <select value={form.mode} onChange={(e) => set("mode", e.target.value)}>
                <option value="remote">Remote</option>
                <option value="in_person">In person</option>
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Session #</label>
              <input
                type="number"
                min={1}
                value={form.session_number}
                onChange={(e) => set("session_number", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>
                Fee <span className={styles.optional}>(optional)</span>
              </label>
              <div className={styles.costRow}>
                <select
                  className={styles.currencySelect}
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  <option value="GBP">£</option>
                  <option value="EUR">€</option>
                  <option value="USD">$</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>
                Contract code <span className={styles.optional}>(optional)</span>
              </label>
              <input
                type="text"
                value={form.contract_code}
                onChange={(e) => set("contract_code", e.target.value)}
                placeholder="e.g. SUP-2026-01"
              />
            </div>
            <div className={styles.field}>
              <label>
                Venue <span className={styles.optional}>(optional)</span>
              </label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder="e.g. Supervisor's practice"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>
              Issues raised <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              rows={3}
              value={form.issues_raised}
              onChange={(e) => set("issues_raised", e.target.value)}
              placeholder="Brief description of what was brought to supervision…"
            />
          </div>

          <div className={styles.field}>
            <label>
              Notes <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Reflections, action points…"
            />
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.track_as_cpd}
              onChange={(e) => set("track_as_cpd", e.target.checked)}
            />
            Track this session as a CPD item
          </label>
        </div>

        <div className={styles.modalFooter}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add session"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

export default function AdminSupervisionPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const [manual, setManual] = useState<ManualRow[]>([]);
  const [calendar, setCalendar] = useState<CalendarRow[]>([]);
  const [privateEvents, setPrivateEvents] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManualRow | null>(null);

  const currentYear = new Date().getFullYear();

  const fetchData = useCallback(async () => {
    if (!userProfile?.id) return;
    const [manualRes, calRes, privateRes] = await Promise.all([
      supabase
        .from("supervision_sessions")
        .select("*")
        .eq("admin_id", userProfile.id)
        .order("date", { ascending: false }),
      supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, supervision_cost_pence, notes")
        .eq("created_by", userProfile.id)
        .eq("is_supervision", true)
        .order("scheduled_at", { ascending: false }),
      supabase
        .from("admin_private_events")
        .select("id, starts_at, ends_at, title, notes, cost_pence, currency")
        .eq("is_supervision", true)
        .order("starts_at", { ascending: false }),
    ]);
    if (manualRes.error) showToast("Failed to load supervision log", "error");
    else setManual((manualRes.data as ManualRow[]) ?? []);
    if (!calRes.error) setCalendar((calRes.data as CalendarRow[]) ?? []);
    if (!privateRes.error)
      setPrivateEvents(
        (privateRes.data ?? []).map((e: any) => ({
          id: e.id,
          scheduled_at: e.starts_at,
          supervisor_name: e.title,
          duration_minutes: Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000),
          supervision_cost_pence: e.cost_pence ?? null,
          currency: e.currency ?? "GBP",
          notes: e.notes,
        })),
      );
    setLoading(false);
  }, [userProfile?.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDelete = async (entry: Entry) => {
    let error: { message: string } | null = null;
    if (entry.sourceTable === "supervision_sessions") {
      ({ error } = await supabase.from("supervision_sessions").delete().eq("id", entry.id));
      if (!error) setManual((prev) => prev.filter((r) => r.id !== entry.id));
    } else if (entry.sourceTable === "sessions") {
      ({ error } = await supabase.from("sessions").update({ is_supervision: false }).eq("id", entry.id));
      if (!error) setCalendar((prev) => prev.filter((r) => r.id !== entry.id));
    } else if (entry.sourceTable === "admin_private_events") {
      ({ error } = await supabase.from("admin_private_events").update({ is_supervision: false }).eq("id", entry.id));
      if (!error) setPrivateEvents((prev) => prev.filter((r) => r.id !== entry.id));
    }
    if (error) showToast("Failed to remove entry", "error");
    else showToast("Entry removed.");
  };

  // Merge manual + calendar into unified list
  const entries: Entry[] = [
    ...manual.map(
      (r): Entry => ({
        id: r.id,
        source: "manual",
        sourceTable: "supervision_sessions",
        date: r.date,
        supervisorName: r.supervisor_name,
        durationMinutes: r.duration_minutes,
        costPence: r.cost_pence,
        currency: r.currency,
        mode: r.mode,
        sessionNumber: r.session_number,
        contractCode: r.contract_code,
        issuesRaised: r.issues_raised,
        venue: r.venue,
        notes: r.notes,
        trackAsCpd: r.track_as_cpd,
        raw: r,
      }),
    ),
    ...calendar.map(
      (r): Entry => ({
        id: r.id,
        source: "calendar",
        sourceTable: "sessions",
        date: dayjs(r.scheduled_at).format("YYYY-MM-DD"),
        supervisorName: (r as any).supervisor_name ?? null,
        durationMinutes: r.duration_minutes,
        costPence: r.supervision_cost_pence,
        currency: "GBP",
        mode: null,
        sessionNumber: null,
        contractCode: null,
        issuesRaised: null,
        venue: null,
        notes: r.notes,
        trackAsCpd: false,
        raw: null,
      }),
    ),
    ...privateEvents.map(
      (r): Entry => ({
        id: r.id,
        source: "calendar",
        sourceTable: "admin_private_events",
        date: dayjs(r.scheduled_at).format("YYYY-MM-DD"),
        supervisorName: r.supervisor_name,
        durationMinutes: r.duration_minutes,
        costPence: r.supervision_cost_pence,
        currency: r.currency ?? "GBP",
        mode: null,
        sessionNumber: null,
        contractCode: null,
        issuesRaised: null,
        venue: null,
        notes: r.notes,
        trackAsCpd: false,
        raw: null,
      }),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // This-year stats
  const thisYear = entries.filter((e) => e.date.startsWith(String(currentYear)));
  const totalHours = thisYear.reduce((s, e) => s + (e.durationMinutes ?? 0), 0) / 60;
  const totalCost = thisYear.reduce((s, e) => s + (e.costPence ?? 0), 0);
  const sessionCount = thisYear.length;

  // Monthly chart data
  const chartData = MONTHS.map((month, i) => {
    const monthEntries = thisYear.filter((e) => {
      const m = new Date(e.date).getMonth();
      return m === i;
    });
    return {
      month,
      hours: Math.round((monthEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0) / 60) * 10) / 10,
    };
  });

  const nextSessionNumber = manual.length + calendar.length + 1;

  if (loading) return null;

  return (
    <div className="page">
      <div className={`inner ${styles.page}`}>
        <div className={styles.header} id="supervision-header">
          <div>
            <h1 className={styles.title}>Supervision</h1>
            <p className={styles.sub}>Track your professional supervision sessions</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Add session
          </Button>
        </div>

        {/* Stats */}
        <div className={styles.statsRow} id="supervision-stats">
          <Card className={styles.statCard}>
            <p className={styles.statValue}>{sessionCount}</p>
            <p className={styles.statLabel}>Sessions this year</p>
          </Card>
          <Card className={styles.statCard}>
            <p className={styles.statValue}>{totalHours.toFixed(1)}h</p>
            <p className={styles.statLabel}>Hours this year</p>
          </Card>
          {totalCost > 0 && (
            <Card className={styles.statCard}>
              <p className={styles.statValue}>£{(totalCost / 100).toFixed(2)}</p>
              <p className={styles.statLabel}>Fees this year</p>
            </Card>
          )}
        </div>

        {/* Monthly chart */}
        {entries.length > 0 && (
          <Card className={styles.chartCard} id="supervision-chart">
            <p className={styles.chartTitle}>Hours per month — {currentYear}</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)",
                    fontSize: "0.82rem",
                    color: "var(--text-primary)",
                  }}
                  formatter={(v: number) => [`${v}h`, "Hours"]}
                />
                <Bar dataKey="hours" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Table */}
        {entries.length === 0 ? (
          <Card className={styles.empty}>
            <p>No supervision sessions yet. Add your first session to get started.</p>
          </Card>
        ) : (
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Supervisor</th>
                  <th>Duration</th>
                  <th>Fee</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.id}>
                    <td className={styles.numCell}>{entries.length - idx}</td>
                    <td className={styles.dateCell}>{entry.date}</td>
                    <td className={styles.nameCell}>{entry.supervisorName ?? "—"}</td>
                    <td className={styles.durationCell}>{fmt(entry.durationMinutes)}</td>
                    <td className={styles.costCell}>{fmtCost(entry.costPence, entry.currency)}</td>
                    <td>
                      <span className={entry.source === "calendar" ? styles.badgeCalendar : styles.badgeManual}>
                        {entry.source === "calendar" ? "Calendar" : "Manual"}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      {entry.source === "manual" && (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => {
                            setEditing(entry.raw as ManualRow);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(entry)}>
                        {entry.source === "calendar" ? "Remove" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {modalOpen && (
        <SupervisionModal
          initial={editing}
          adminId={userProfile?.id ?? ""}
          nextSessionNumber={nextSessionNumber}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchData();
          }}
        />
      )}
    </div>
  );
}
