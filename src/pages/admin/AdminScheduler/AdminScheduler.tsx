import { useEffect, useMemo, useState } from "react";
import type { View } from "react-big-calendar";
import { Views } from "react-big-calendar";
import { useSearchParams } from "react-router-dom";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Button, Card, CollapsibleSection } from "@components/shared/index";
import SchedulerCalendar from "@components/shared/SchedulerCalendar/SchedulerCalendar";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { RootState } from "@/store";

import { useAuth } from "@/context/AuthContext";
import { isPageStatusLoading } from "@/Helpers/Helpers";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import type { Session, UserProfile } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchAllSessions } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";
import AvailabilityEditor from "./AvailabilityEditor";
import { availabilityEvents, type SchedulerEvent, sessionEvents } from "./schedulerUtils";

import styles from "./AdminScheduler.module.scss";

// ============================================================
// ADMIN SCHEDULER
//
// Sessionly-style week view on /admin/scheduler. Renders two layers
// of events on one grid (via the shared SchedulerCalendar):
//   • availability windows (green)  — expanded from availability_rules
//     + availability_overrides for the visible week
//   • booked sessions (per-client colour) — from the sessions table
//
// Clicking a session opens CreateSessionModal in edit mode, which is
// the existing admin reschedule flow (updates scheduled_at, fires the
// notify-session-rescheduled edge function). Admins can move a session
// to ANY date/time — they aren't restricted to the availability windows.
//
// The overview section adds donut charts (shared DonutChart) + a few key
// number cards, all recomputed from the sessions scoped by the client filter.
// ============================================================

type SchedulerPeriod = "all" | "day" | "week" | "month" | "year";

const PERIODS: { value: SchedulerPeriod; label: string }[] = [
  { value: "all", label: "All" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

// [start, end) window for a period, or null for "all time". Week is Monday-anchored.
const periodRange = (period: SchedulerPeriod): { start: Date; end: Date } | null => {
  if (period === "all") return null;
  const now = new Date();
  if (period === "day") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (period === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
};

const AdminScheduler = () => {
  const dispatch = useAppDispatch();
  const { isDemo } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<View>(Views.WORK_WEEK);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  // Overview client filter: "all" or a specific client id.
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  // Session-totals period filter.
  const [period, setPeriod] = useState<SchedulerPeriod>("all");

  // Dashboard "Manage availability" quick action links here with ?availability=1
  // so the editor opens straight away. Clear the param once consumed.
  useEffect(() => {
    if (searchParams.get("availability") === "1") {
      setIsAvailabilityOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ----- data
  useFetchOnIdle((s: RootState) => s.sessions.status, fetchAllSessions, "Failed to load sessions");
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");
  useFetchOnIdle((s: RootState) => s.availability.status, fetchAvailability, "Failed to load availability");

  // Any admin-side session change (from any device) refreshes the grid.
  // duration_minutes>=0 matches every row; RLS still scopes the stream to
  // this admin's own sessions. (The hook needs a non-empty filter string.)
  useRealtimeTable("sessions", "duration_minutes=gte.0", () => dispatch(fetchAllSessions()));

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const users = useAppSelector(selectAllUsers) as UserProfile[];
  const clients = useAppSelector(selectClientUsers);
  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  // ----- events
  const events = useMemo<SchedulerEvent[]>(
    () => [...availabilityEvents(date, rules, overrides), ...sessionEvents(sessions, users)],
    [date, rules, overrides, sessions, users],
  );

  // ----- overview: sessions scoped to the selected client (or all)
  const filteredSessions = useMemo(
    () => (selectedClientId === "all" ? sessions : sessions.filter((s) => s.client_id === selectedClientId)),
    [sessions, selectedClientId],
  );

  // Aggregate counts + payment totals in a single pass. Semantics match the
  // SessionCard: no-show is strictly attended===false (null = unmarked, not
  // counted as skipped); revenue/outstanding split on the `paid` flag.
  const stats = useMemo(() => {
    const now = Date.now();
    return filteredSessions.reduce(
      (acc, s) => {
        acc.total += 1;
        if (s.attended === true) acc.attended += 1;
        if (s.attended === false) acc.skipped += 1;
        if (s.status === "cancelled") acc.cancelled += 1;
        if (s.status === "completed") acc.statusCompleted += 1;
        if (s.status === "rescheduled") acc.statusRescheduled += 1;
        if (s.status === "scheduled") acc.statusScheduled += 1;
        if (s.status === "scheduled" && new Date(s.scheduled_at).getTime() > now) acc.upcoming += 1;
        if (s.paid) {
          acc.paidCount += 1;
          acc.revenuePence += s.price_pence ?? 0;
        } else {
          acc.outstandingPence += s.price_pence ?? 0;
        }
        return acc;
      },
      {
        total: 0,
        attended: 0,
        skipped: 0,
        cancelled: 0,
        upcoming: 0,
        paidCount: 0,
        revenuePence: 0,
        outstandingPence: 0,
        statusScheduled: 0,
        statusCompleted: 0,
        statusRescheduled: 0,
      },
    );
  }, [filteredSessions]);

  // Most-recent-first history for the session list below the calendar.
  const recentSessions = useMemo(
    () =>
      [...filteredSessions]
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 10),
    [filteredSessions],
  );

  const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

  // ----- session totals: hours + remote vs in-person split for the selected
  // period (default all time). Scoped to the client filter, cancelled excluded.
  // Remote = anything not explicitly "in_person" (online/null), per SessionCard.
  const periodStats = useMemo(() => {
    const range = periodRange(period);
    return filteredSessions.reduce(
      (acc, s) => {
        if (s.status === "cancelled") return acc;
        if (range) {
          const t = new Date(s.scheduled_at);
          if (t < range.start || t >= range.end) return acc;
        }
        acc.minutes += s.duration_minutes ?? 0;
        if (s.location === "in_person") acc.inPerson += 1;
        else acc.remote += 1;
        return acc;
      },
      { minutes: 0, remote: 0, inPerson: 0 },
    );
  }, [filteredSessions, period]);

  const totalCards = [
    { label: "Total hours", value: `${(periodStats.minutes / 60).toFixed(1)}h`, tone: styles.toneAccent },
    { label: "Remote", value: periodStats.remote, tone: "" },
    { label: "In-person", value: periodStats.inPerson, tone: "" },
  ];

  // ----- donut chart data (recomputed from the filtered stats)
  const unmarked = stats.total - stats.attended - stats.skipped;
  const marked = stats.attended + stats.skipped;
  const attendanceRate = marked > 0 ? Math.round((stats.attended / marked) * 100) : null;

  const attendanceSlices: DonutSlice[] = [
    { name: "Attended", value: stats.attended, color: "#2d7264" },
    { name: "No-show", value: stats.skipped, color: "#b34437" },
    { name: "Unmarked", value: unmarked, color: "#c2c7cc" },
  ];

  const paymentSlices: DonutSlice[] = [
    { name: "Paid", value: stats.paidCount, color: "#2d7264" },
    { name: "Unpaid", value: stats.total - stats.paidCount, color: "#c98a2b" },
  ];

  const statusSlices: DonutSlice[] = [
    { name: "Scheduled", value: stats.statusScheduled, color: "#3a7fa8" },
    { name: "Completed", value: stats.statusCompleted, color: "#2d7264" },
    { name: "Cancelled", value: stats.cancelled, color: "#9aa0a6" },
    { name: "Rescheduled", value: stats.statusRescheduled, color: "#8a6a2d" },
  ];

  const statCards = [
    { label: "Total sessions", value: stats.total, tone: "" },
    { label: "Upcoming", value: stats.upcoming, tone: styles.toneAccent },
    { label: "Revenue", value: money(stats.revenuePence), tone: styles.toneGood },
    { label: "Outstanding", value: money(stats.outstandingPence), tone: styles.toneWarn },
  ];

  const handleSelectEvent = (event: SchedulerEvent) => {
    const r = event.resource;
    if (r.type === "session") {
      setEditingSession(r.session);
    } else {
      // Clicking a window (or blocked slot) jumps into the availability editor.
      setIsAvailabilityOpen(true);
    }
  };

  const editingClientName = useMemo(() => {
    if (!editingSession) return "";
    const u = users.find((x) => x.id === editingSession.client_id);
    return u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "";
  }, [editingSession, users]);

  const guard = isPageStatusLoading(sessionsStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>Schedule</h1>
            <p className={styles.subheading}>All sessions and your availability, one view.</p>
          </div>
          <Button onClick={() => setIsAvailabilityOpen(true)}>Manage availability</Button>
        </div>

        {/* ── Session overview: aggregate stats, filterable by client ──
            The client filter lives in the section header (headerRight) so it
            stays visible + controls every section even when this one is
            collapsed. Each section's open/closed state persists in
            localStorage (survives route changes + reloads). */}
        <CollapsibleSection
          title="Session overview"
          storageKey="scheduler:overview"
          headerRight={
            <label className={styles.filter}>
              <span className={styles.filterLabel}>Client</span>
              <select
                className={styles.filterSelect}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="all">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed client"}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <div className={styles.chartsGrid}>
            <DonutChart
              title="Attendance"
              slices={attendanceSlices}
              centerValue={attendanceRate === null ? "—" : `${attendanceRate}%`}
              centerLabel={attendanceRate === null ? "unmarked" : "attended"}
            />
            <DonutChart
              title="Payments"
              slices={paymentSlices}
              centerValue={money(stats.revenuePence)}
              centerLabel="collected"
            />
            <DonutChart
              title="Session status"
              slices={statusSlices}
              centerValue={String(stats.total)}
              centerLabel={stats.total === 1 ? "session" : "sessions"}
            />
          </div>

          <div className={styles.statsGrid}>
            {statCards.map((s) => (
              <Card key={s.label} className={styles.statCard}>
                <p className={`${styles.statValue} ${s.tone}`}>{s.value}</p>
                <p className={styles.statLabel}>{s.label}</p>
              </Card>
            ))}
          </div>

          {/* Session totals — lives under the overview, separated by a divider.
              Its own period toggle (independent of the client filter above). */}
          <hr className={styles.divider} />
          <div className={styles.totalsHeader}>
            <h3 className={styles.totalsLabel}>Session totals</h3>
            <div className={styles.periodToggle}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`${styles.periodBtn} ${period === p.value ? styles.periodActive : ""}`}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.statsGrid}>
            {totalCards.map((s) => (
              <Card key={s.label} className={styles.statCard}>
                <p className={`${styles.statValue} ${s.tone}`}>{s.value}</p>
                <p className={styles.statLabel}>{s.label}</p>
              </Card>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Calendar" storageKey="scheduler:calendar">
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchWindow}`} /> Availability
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchBlocked}`} /> Blocked
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.swatchSession}`} /> Session
            </span>
          </div>

          <Card className={styles.calendarCard}>
            <SchedulerCalendar
              events={events}
              date={date}
              view={view}
              onNavigate={setDate}
              onView={setView}
              onSelectEvent={handleSelectEvent}
            />
          </Card>
        </CollapsibleSection>

        <CollapsibleSection
          title="Session history"
          storageKey="scheduler:history"
          headerRight={
            <span className={styles.historyMeta}>
              {selectedClientId === "all" ? "Recent across all clients" : "Recent for this client"}
            </span>
          }
        >
          {recentSessions.length > 0 ? (
            <div className={styles.historyList}>
              {recentSessions.map((session) => (
                <SessionCard key={session.id} session={session} isAdmin isDemo={isDemo} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No sessions yet.</p>
          )}
        </CollapsibleSection>
      </div>

      {editingSession && (
        <CreateSessionModal
          session={editingSession}
          clientId={editingSession.client_id ?? ""}
          clientName={editingClientName}
          onClose={() => setEditingSession(null)}
        />
      )}

      {/* The editor handles demo mode internally (writes are guarded + toasted). */}
      {isAvailabilityOpen && <AvailabilityEditor onClose={() => setIsAvailabilityOpen(false)} />}
    </div>
  );
};

export default AdminScheduler;
