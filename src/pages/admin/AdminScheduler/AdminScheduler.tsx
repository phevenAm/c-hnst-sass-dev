import { useEffect, useMemo, useState } from "react";
import type { View } from "react-big-calendar";
import { Views } from "react-big-calendar";
import { useNavigate, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Button, Card, CollapsibleSection, SplitButton } from "@components/shared/index";
import SchedulerCalendar, { type EventInteractionArgs } from "@components/shared/SchedulerCalendar/SchedulerCalendar";
import {
  availabilityEvents,
  privateEventEvents,
  type SchedulerEvent,
  sessionEvents,
  stubSessionEvents,
} from "@components/shared/SchedulerCalendar/schedulerUtils";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { RootState } from "@/store";

import Modal from "@/components/shared/Modal/Modal";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import { supabase } from "@/lib/supabase.js";
import type { AdminPrivateEvent, ClientStub, Session, StubSession, UserProfile } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPrivateEvents } from "@/store/slices/adminPrivateEventsSlice";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import { fetchAllSessions, updateSession } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";
import StubSessionCard from "../AdminStubDetailPage/StubSessionCard";
import AvailabilityEditor from "./AvailabilityEditor";
import PrivateEventModal from "./PrivateEventModal";

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
// Clicking a session opens a details modal (SessionCard) — its own
// "Reschedule" button opens CreateSessionModal in edit mode from there
// (updates scheduled_at, fires the notify-session-rescheduled edge
// function). Admins can move a session to ANY date/time — they aren't
// restricted to the availability windows. Dragging a session directly
// on the grid is the other, faster path to the same reschedule.
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
  const navigate = useNavigate();
  const { isDemo, practiceSettings, userProfile } = useAuth();
  const { showToast } = useToast();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<View>(Views.WORK_WEEK);
  // Clicking a session on the calendar opens this detail card (SessionCard,
  // same as everywhere else it's used) rather than jumping straight to the
  // edit form — SessionCard's own "Reschedule" button opens CreateSessionModal
  // itself from there when the admin actually wants to edit it.
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [viewingStubSession, setViewingStubSession] = useState<StubSession | null>(null);
  const [allStubSessions, setAllStubSessions] = useState<StubSession[]>([]);
  const [newSessionWithoutId, setNewSessionWithoutId] = useState(false);
  const [newSessionClientId, setNewSessionClientId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{
    session: Session;
    clientName: string;
    start: Date;
    prevDate: string;
  } | null>(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  // Private-event modal: closed when false; `editingPrivate` is null for a new
  // event or the row being edited.
  const [isPrivateOpen, setIsPrivateOpen] = useState(false);
  const [editingPrivate, setEditingPrivate] = useState<AdminPrivateEvent | null>(null);
  // Overview client filter: "all" or a specific client id.
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  // Session-totals period filter.
  const [period, setPeriod] = useState<SchedulerPeriod>("all");
  // Whether to email the client when confirming a drag-and-drop reschedule.
  const [notifyOnDrop, setNotifyOnDrop] = useState(true);

  // Dashboard "Manage availability" quick action links here with ?availability=1
  // so the editor opens straight away. Clear the param once consumed.
  useEffect(() => {
    if (searchParams.get("availability") === "1") {
      setIsAvailabilityOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Declared here (before the useEffect below) so the dependency array doesn't hit TDZ.
  const allStubs = useAppSelector(selectAllStubs);

  // When an offline client is picked from the new-session dropdown, navigate to
  // their stub detail page instead of opening CreateSessionModal (stub sessions
  // live in stub_sessions, not sessions — the FK would reject a sessions insert).
  useEffect(() => {
    if (!newSessionClientId) return;
    if (allStubs.some((s) => s.id === newSessionClientId)) {
      navigate(`/admin/clients/stub/${newSessionClientId}`);
      setNewSessionClientId(null);
      setNewSessionWithoutId(false);
    }
  }, [newSessionClientId, allStubs]);

  useEffect(() => {
    if (searchParams.get("newSession") === "1") {
      setNewSessionWithoutId(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ----- data
  useFetchOnIdle((s: RootState) => s.sessions.status, fetchAllSessions, "Failed to load sessions");
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");
  useFetchOnIdle((s: RootState) => s.availability.status, fetchAvailability, "Failed to load availability");
  useFetchOnIdle((s: RootState) => s.adminPrivateEvents.status, fetchPrivateEvents, "Failed to load private events");
  useFetchOnIdle((s: RootState) => s.clientStubs.status, fetchClientStubs, "Failed to load offline clients");

  // Any admin-side session change (from any device) refreshes the grid.
  // duration_minutes>=0 matches every row; RLS still scopes the stream to
  // this admin's own sessions. (The hook needs a non-empty filter string.)
  useRealtimeTable("sessions", "duration_minutes=gte.0", () => dispatch(fetchAllSessions()));

  // Stub sessions have no Redux slice — fetch directly and keep live via realtime.
  const fetchStubSessions = () => {
    supabase
      .from("stub_sessions")
      .select("*")
      .then(({ data, error }) => {
        if (error) console.error("Failed to load stub sessions:", error);
        else setAllStubSessions((data as StubSession[]) ?? []);
      });
  };

  useEffect(() => {
    fetchStubSessions();
  }, []);

  useRealtimeTable("stub_sessions", userProfile?.id ? `admin_id=eq.${userProfile.id}` : undefined, fetchStubSessions);

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const users = useAppSelector(selectAllUsers) as UserProfile[];
  const clients = useAppSelector(selectClientUsers);
  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);
  const privateEvents = useAppSelector((s) => s.adminPrivateEvents.events);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  // Derive whether the current filter refers to an offline client (stub) or a
  // real client. Values are either "all", a real user UUID, or "stub:<stubId>".
  const selectedStubId = selectedClientId.startsWith("stub:") ? selectedClientId.slice(5) : null;
  const isStubSelected = selectedStubId !== null;
  const isRealClientSelected = !isStubSelected && selectedClientId !== "all";

  // ----- overview: sessions scoped to the selected client (or all).
  // Stub clients have no rows in the sessions table so their filter returns [].
  const filteredSessions = useMemo(
    () =>
      isStubSelected
        ? []
        : selectedClientId === "all"
          ? sessions
          : sessions.filter((s) => s.client_id === selectedClientId),
    [sessions, selectedClientId, isStubSelected],
  );

  // ----- stub sessions scoped to the client filter.
  // Hidden entirely when a real client is selected; narrowed to one stub when
  // a stub is selected; otherwise all unlinked stubs show (default "all").
  const filteredStubSessions = useMemo(
    () =>
      allStubSessions.filter((s) => {
        const stub = allStubs.find((st) => st.id === s.stub_id);
        if (!stub || stub.linked_user_id) return false;
        if (isRealClientSelected) return false;
        if (isStubSelected) return s.stub_id === selectedStubId;
        return true;
      }),
    [allStubSessions, allStubs, isRealClientSelected, isStubSelected, selectedStubId],
  );

  // ----- events. Both session layers honour the client filter so the calendar
  // matches the overview + history below it; availability windows are
  // practice-wide and always shown.
  const events = useMemo<SchedulerEvent[]>(
    () => [
      ...availabilityEvents(date, rules, overrides),
      ...privateEventEvents(privateEvents),
      ...sessionEvents(filteredSessions, users, useCodenames),
      ...stubSessionEvents(filteredStubSessions, allStubs, useCodenames),
    ],
    [date, rules, overrides, privateEvents, filteredSessions, users, useCodenames, filteredStubSessions, allStubs],
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
  // "History" means already happened — future sessions belong on the
  // calendar/upcoming view, not here.
  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the page only when the client filter changes, not on every realtime session update
  useEffect(() => {
    setHistoryPage(1);
  }, [selectedClientId]);

  const pastSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => new Date(s.scheduled_at) <= new Date())
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [filteredSessions],
  );

  const pastStubSessions = useMemo(
    () =>
      filteredStubSessions
        .filter((s) => new Date(s.scheduled_at) <= new Date())
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [filteredStubSessions],
  );

  const historyTotal = isStubSelected ? pastStubSessions.length : pastSessions.length;
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  const recentSessions = useMemo(
    () => pastSessions.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
    [pastSessions, historyPage],
  );

  const recentStubSessions = useMemo(
    () => pastStubSessions.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
    [pastStubSessions, historyPage],
  );

  const handleStubSessionUpdated = (updated: StubSession) =>
    setAllStubSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

  const handleStubSessionDeleted = (id: string) => setAllStubSessions((prev) => prev.filter((s) => s.id !== id));

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

  const statusSlices: DonutSlice[] = [
    { name: "Scheduled", value: stats.statusScheduled, color: "#3a7fa8" },
    { name: "Completed", value: stats.statusCompleted, color: "#2d7264" },
    { name: "Cancelled", value: stats.cancelled, color: "#9aa0a6" },
    { name: "Rescheduled", value: stats.statusRescheduled, color: "#8a6a2d" },
  ];

  const statCards = [
    { label: "Total sessions", value: stats.total, tone: "" },
    { label: "Upcoming", value: stats.upcoming, tone: styles.toneAccent },
  ];

  const openNewPrivate = () => {
    setEditingPrivate(null);
    setIsPrivateOpen(true);
  };

  const closeNewSessionPicker = () => {
    setNewSessionWithoutId(false);
    setNewSessionClientId(null);
  };

  const startNewSessionForClient = (clientId: string) => {
    setNewSessionClientId(clientId);
    setNewSessionWithoutId(false);
  };

  const handleSelectEvent = (event: SchedulerEvent) => {
    const r = event.resource;
    if (r.type === "buffer" || r.type === "cancelled-stub-session") return;
    if (r.type === "session" || r.type === "cancelled-session") {
      setViewingSession(r.session);
    } else if (r.type === "stub-session") {
      setViewingStubSession(r.stubSession);
    } else if (r.type === "private") {
      setEditingPrivate(r.event);
      setIsPrivateOpen(true);
    } else {
      // Clicking a window (or blocked slot) jumps into the availability editor.
      setIsAvailabilityOpen(true);
    }
  };

  const handleEventDrop = ({ event, start }: EventInteractionArgs<SchedulerEvent>) => {
    const r = event.resource;
    if (r.type !== "session" && r.type !== "stub-session") return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }

    if (r.type === "stub-session") {
      const proposedStart = new Date(start as Date);
      supabase
        .from("stub_sessions")
        .update({ scheduled_at: proposedStart.toISOString() })
        .eq("id", r.stubSession.id)
        .then(({ error }) => {
          if (error) {
            showToast("Failed to reschedule session.", "danger");
          } else {
            setAllStubSessions((prev) =>
              prev.map((s) => (s.id === r.stubSession.id ? { ...s, scheduled_at: proposedStart.toISOString() } : s)),
            );
            showToast("Session rescheduled.");
          }
        });
      return;
    }

    const proposedStart = new Date(start as Date);
    const { session } = r;
    const proposedEnd = dayjs(proposedStart)
      .add(session.duration_minutes ?? 50, "minute")
      .toDate();

    const hasOverlap = sessions.some((s) => {
      if (s.id === session.id || s.status === "cancelled") return false;
      const sStart = new Date(s.scheduled_at);
      const sEnd = dayjs(sStart)
        .add(s.duration_minutes ?? 50, "minute")
        .toDate();
      return proposedStart < sEnd && proposedEnd > sStart;
    });

    if (hasOverlap) {
      showToast("That slot overlaps with another session — pick a different time.", "danger");
      return;
    }

    setPendingDrop({ session, clientName: r.clientName, start: proposedStart, prevDate: session.scheduled_at });
  };

  const handleConfirmDrop = () => {
    if (!pendingDrop) return;
    const { session, start, prevDate } = pendingDrop;
    dispatch(updateSession({ id: session.id, scheduled_at: start.toISOString(), status: "rescheduled" })).then(() => {
      if (notifyOnDrop) {
        supabase.functions.invoke("notify-session-rescheduled", {
          body: { session_id: session.id, previous_date: prevDate },
        });
      }
      showToast("Session rescheduled.", "success");
    });
    setPendingDrop(null);
    setNotifyOnDrop(true);
  };

  // Session-history header — names who "this client" actually is instead of
  // leaving it generic, so switching the filter visibly changes the label.
  const selectedClientLabel = useMemo(() => {
    if (selectedClientId === "all") return "Recent across all clients";
    if (isStubSelected) {
      const stub = allStubs.find((s) => s.id === selectedStubId);
      if (!stub) return "Recent for this client";
      const name = useCodenames
        ? stub.codename || `${stub.first_name} ${stub.last_name}`
        : `${stub.first_name} ${stub.last_name}`;
      return `Recent for ${name}`;
    }
    const client = clients.find((c) => c.id === selectedClientId);
    return client ? `Recent for ${clientDisplayName(client, useCodenames)}` : "Recent for this client";
  }, [selectedClientId, isStubSelected, selectedStubId, allStubs, clients, useCodenames]);

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
          <div className={styles.headerActions}>
            <SplitButton
              variant="primary"
              // size="sm"
              primaryLabel="Create new session"
              primaryAction={() => setNewSessionWithoutId(true)}
              options={[
                { label: "Add private event", onClick: openNewPrivate },
                { label: "Manage availability", onClick: () => setIsAvailabilityOpen(true) },
              ]}
            />
          </div>
        </div>

        {/* ── Session overview: aggregate stats, filterable by client ──
            The client filter lives in the section header (headerRight) so it
            stays visible + controls every section even when this one is
            collapsed. Each section's open/closed state persists in
            localStorage (survives route changes + reloads). */}
        <Card className={styles.sectionCard}>
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
                      {clientDisplayName(c, useCodenames)}
                    </option>
                  ))}
                  {allStubs.filter((s) => !s.linked_user_id).length > 0 && (
                    <optgroup label="Offline clients">
                      {allStubs
                        .filter((s) => !s.linked_user_id)
                        .map((s) => (
                          <option key={s.id} value={`stub:${s.id}`}>
                            {useCodenames
                              ? s.codename || `${s.first_name} ${s.last_name}`
                              : `${s.first_name} ${s.last_name}`}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </label>
            }
          >
            <div className={styles.statsGrid}>
              {statCards.map((s) => (
                <Card key={s.label} className={styles.statCard}>
                  <p className={`${styles.statValue} ${s.tone}`}>{s.value}</p>
                  <p className={styles.statLabel}>{s.label}</p>
                </Card>
              ))}
            </div>
            <div className={styles.chartsGrid}>
              <DonutChart
                title="Attendance"
                slices={attendanceSlices}
                centerValue={attendanceRate === null ? "—" : `${attendanceRate}%`}
                centerLabel={attendanceRate === null ? "unmarked" : "attended"}
              />
              <DonutChart
                title="Session status"
                slices={statusSlices}
                centerValue={String(stats.total)}
                centerLabel={stats.total === 1 ? "session" : "sessions"}
              />
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
        </Card>

        <Card className={styles.sectionCard}>
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
              <span className={styles.legendItem}>
                <span className={`${styles.swatch} ${styles.swatchPrivate}`} /> Private
              </span>
            </div>
            <p className={styles.calendarHint}>Drag a session to reschedule it, or click one to view and edit it.</p>

            <Card className={styles.calendarCard}>
              <SchedulerCalendar
                events={events}
                date={date}
                view={view}
                onNavigate={setDate}
                onView={setView}
                onSelectEvent={handleSelectEvent}
                onEventDrop={handleEventDrop}
              />
            </Card>
          </CollapsibleSection>
        </Card>

        <Card className={styles.sectionCard}>
          <CollapsibleSection
            title="Session history"
            storageKey="scheduler:history"
            headerRight={<span className={styles.historyMeta}>{selectedClientLabel}</span>}
          >
            {isStubSelected ? (
              recentStubSessions.length > 0 ? (
                <div className={styles.historyList}>
                  {recentStubSessions.map((session, idx) => (
                    <StubSessionCard
                      key={session.id}
                      session={session}
                      sessionNumber={historyTotal - ((historyPage - 1) * HISTORY_PAGE_SIZE + idx)}
                      stubId={selectedStubId!}
                      adminId={userProfile!.id}
                      isDemo={isDemo}
                      onUpdated={handleStubSessionUpdated}
                      onDeleted={handleStubSessionDeleted}
                    />
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>No past sessions.</p>
              )
            ) : recentSessions.length > 0 ? (
              <div className={styles.historyList}>
                {recentSessions.map((session) => {
                  const client = clients.find((c) => c.id === session.client_id);
                  return (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isAdmin
                      isDemo={isDemo}
                      clientLabel={client ? clientDisplayName(client, useCodenames) : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>No past sessions.</p>
            )}
            {historyPageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistoryPage((p) => p - 1)}
                  disabled={historyPage <= 1}
                >
                  ← Prev
                </Button>
                <span className={styles.historyMeta}>
                  Page {historyPage} of {historyPageCount}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setHistoryPage((p) => p + 1)}
                  disabled={historyPage >= historyPageCount}
                >
                  Next →
                </Button>
              </div>
            )}
          </CollapsibleSection>
        </Card>
      </div>

      {pendingDrop && (
        <Modal
          title="Confirm reschedule"
          size="sm"
          onClose={() => {
            setPendingDrop(null);
            setNotifyOnDrop(true);
          }}
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingDrop(null);
                  setNotifyOnDrop(true);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmDrop}>
                Confirm
              </Button>
            </>
          }
        >
          <p className={styles.confirmText}>
            Move <strong>{pendingDrop.clientName}</strong>'s session from{" "}
            <strong>{dayjs(pendingDrop.prevDate).format("D MMM [at] h:mma")}</strong> to{" "}
            <strong>{dayjs(pendingDrop.start).format("D MMM [at] h:mma")}</strong>?
          </p>
          <label className={styles.notifyCheckbox}>
            <input type="checkbox" checked={notifyOnDrop} onChange={(e) => setNotifyOnDrop(e.target.checked)} />
            Notify client by email
          </label>
        </Modal>
      )}

      {viewingSession && (
        <Modal
          title={
            clients.find((c) => c.id === viewingSession.client_id)
              ? `Session with ${clientDisplayName(clients.find((c) => c.id === viewingSession.client_id)!, useCodenames)}`
              : "Session details"
          }
          onClose={() => setViewingSession(null)}
          size="md"
        >
          <SessionCard
            session={viewingSession}
            isAdmin
            isDemo={isDemo}
            clientLabel={(() => {
              const client = clients.find((c) => c.id === viewingSession.client_id);
              return client ? clientDisplayName(client, useCodenames) : undefined;
            })()}
          />
        </Modal>
      )}

      {viewingStubSession && (
        <Modal title="Session details" onClose={() => setViewingStubSession(null)} size="md">
          <StubSessionCard
            session={viewingStubSession}
            sessionNumber={
              [...allStubSessions]
                .filter((s) => s.stub_id === viewingStubSession.stub_id)
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                .findIndex((s) => s.id === viewingStubSession.id) + 1
            }
            stubId={viewingStubSession.stub_id}
            adminId={userProfile?.id ?? ""}
            isDemo={isDemo}
            onUpdated={(updated) => {
              handleStubSessionUpdated(updated);
              setViewingStubSession(updated);
            }}
            onDeleted={(id) => {
              handleStubSessionDeleted(id);
              setViewingStubSession(null);
            }}
          />
        </Modal>
      )}

      {newSessionWithoutId && !newSessionClientId && (
        <Modal
          title="Who is this session for?"
          onClose={closeNewSessionPicker}
          size="md"
          actions={
            <>
              <Button variant="ghost" onClick={closeNewSessionPicker}>
                Cancel
              </Button>
              <Button
                disabled={!newSessionClientId}
                onClick={() => {
                  if (!newSessionClientId) return;
                  const isStub = allStubs.some((s) => s.id === newSessionClientId);
                  if (isStub) {
                    navigate(`/admin/clients/stub/${newSessionClientId}`);
                    closeNewSessionPicker();
                  } else {
                    startNewSessionForClient(newSessionClientId);
                  }
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <p className={styles.modalIntro}>Pick the client first, then schedule their session.</p>
          <div className={styles.clientSelectWrapper}>
            <label htmlFor="new-session-client" className={styles.selectLabel}>
              Client
            </label>
            <select
              id="new-session-client"
              className={styles.clientSelect}
              value={newSessionClientId ?? ""}
              onChange={(e) => setNewSessionClientId(e.target.value || null)}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {clientDisplayName(client, useCodenames)}
                </option>
              ))}
              {allStubs.filter((s) => !s.linked_user_id).length > 0 && (
                <optgroup label="Offline clients">
                  {allStubs
                    .filter((s) => !s.linked_user_id)
                    .map((stub) => (
                      <option key={stub.id} value={stub.id}>
                        {useCodenames
                          ? stub.codename || `${stub.first_name} ${stub.last_name}`
                          : `${stub.first_name} ${stub.last_name}`}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        </Modal>
      )}

      {newSessionClientId && !allStubs.some((s) => s.id === newSessionClientId) && (
        <CreateSessionModal
          clientId={newSessionClientId}
          clientName={clientDisplayName(
            users.find((u) => u.id === newSessionClientId) ?? ({ first_name: "", last_name: "" } as any),
            useCodenames,
          )}
          onClose={() => {
            setNewSessionWithoutId(false);
            setNewSessionClientId(null);
          }}
        />
      )}

      {/* The editor handles demo mode internally (writes are guarded + toasted). */}
      {isAvailabilityOpen && <AvailabilityEditor onClose={() => setIsAvailabilityOpen(false)} />}

      {isPrivateOpen && <PrivateEventModal event={editingPrivate} onClose={() => setIsPrivateOpen(false)} />}
    </div>
  );
};

export default AdminScheduler;
