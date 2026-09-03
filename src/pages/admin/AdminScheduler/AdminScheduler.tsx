import { useCallback, useEffect, useMemo, useState } from "react";
import type { View } from "react-big-calendar";
import { Views } from "react-big-calendar";
import { useNavigate, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Button, Card, CollapsibleSection, SegmentedTabs, SplitButton } from "@components/shared/index";
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
import { hasSlotConflict } from "@/Helpers/sessionOverlap";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import { supabase } from "@/lib/supabase.js";
import type { AdminPrivateEvent, Session, StubSession, UserProfile } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPrivateEvents, updatePrivateEvent } from "@/store/slices/adminPrivateEventsSlice";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { fetchAllSessions, updateSession } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";
import StubSessionCard from "../AdminStubDetailPage/StubSessionCard";
import AvailabilityEditor from "./AvailabilityEditor";
import PrivateEventModal from "./PrivateEventModal";
import {
  computeOverviewStats,
  filterAndSortByScope,
  type ListScope,
  toOverviewSessions,
} from "./schedulerOverviewUtils";

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

const SCOPES: { value: ListScope; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

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
  // Click-to-create: the date/time the admin clicked on an empty part of the
  // grid. While set and no `slotChoice` is made yet, the "what goes here?"
  // chooser shows; picking an option opens that flow pre-seeded with this time.
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [slotChoice, setSlotChoice] = useState<null | "session" | "private">(null);
  // Overview client filter: "all" or a specific client id.
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  // Session-totals period filter.
  const [period, setPeriod] = useState<SchedulerPeriod>("all");
  // Session list scope: upcoming (default), past, or everything.
  const [scope, setScope] = useState<ListScope>("upcoming");
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
  }, [newSessionClientId, allStubs, navigate]);

  useEffect(() => {
    if (searchParams.get("newSession") === "1") {
      setNewSessionWithoutId(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // ----- data
  // state.sessions is shared with AdminClientsPageDetailed, which fills it
  // with just one client's rows (fetchSessionsByClientId) and still sets
  // status "succeeded" — useFetchOnIdle would treat that as already-loaded,
  // and picking a different client in the filter below would then show an
  // empty calendar until a hard refresh. Refetch whenever the loaded set
  // isn't the whole practice; once it is, `scope === "all"` stops the loop.
  const sessionsScope = useAppSelector((s: RootState) => s.sessions.scope);
  const sessionsStatusForFetch = useAppSelector((s: RootState) => s.sessions.status);
  useEffect(() => {
    if (sessionsStatusForFetch !== "loading" && sessionsScope !== "all") {
      dispatch(fetchAllSessions());
    }
  }, [dispatch, sessionsScope, sessionsStatusForFetch]);
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");
  useFetchOnIdle((s: RootState) => s.availability.status, fetchAvailability, "Failed to load availability");
  useFetchOnIdle((s: RootState) => s.adminPrivateEvents.status, fetchPrivateEvents, "Failed to load private events");
  useFetchOnIdle((s: RootState) => s.clientStubs.status, fetchClientStubs, "Failed to load offline clients");
  useFetchOnIdle(
    (s: RootState) => s.practiceSettings.status,
    fetchPracticeSettings,
    "Failed to load practice settings",
  );

  // Any admin-side session change (from any device) refreshes the grid.
  // duration_minutes>=0 matches every row; RLS still scopes the stream to
  // this admin's own sessions. (The hook needs a non-empty filter string.)
  useRealtimeTable("sessions", "duration_minutes=gte.0", () => dispatch(fetchAllSessions()));

  // Stub sessions have no Redux slice — fetch directly and keep live via realtime.
  // useCallback keeps this stable across renders — without it, the effect below
  // (which depends on it) would refetch on every render, forever, since a plain
  // function is a new reference each time and every fetch's setState triggers
  // another render.
  const fetchStubSessions = useCallback(() => {
    supabase
      .from("stub_sessions")
      .select("*")
      .then(({ data, error }) => {
        if (error) console.error("Failed to load stub sessions:", error);
        else setAllStubSessions((data as StubSession[]) ?? []);
      });
  }, []);

  useEffect(() => {
    fetchStubSessions();
  }, [fetchStubSessions]);

  useRealtimeTable("stub_sessions", userProfile?.id ? `admin_id=eq.${userProfile.id}` : undefined, fetchStubSessions);

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const users = useAppSelector(selectAllUsers) as UserProfile[];
  const clients = useAppSelector(selectClientUsers);
  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);
  const privateEvents = useAppSelector((s) => s.adminPrivateEvents.events);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);
  // Post-session buffer strip length (minutes). 0 = practice has turned it off.
  const bufferMinutes = useAppSelector((s) => s.practiceSettings.data?.session_buffer_minutes ?? 10);

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
      ...sessionEvents(filteredSessions, users, useCodenames, bufferMinutes),
      ...stubSessionEvents(filteredStubSessions, allStubs, useCodenames, bufferMinutes),
    ],
    [
      date,
      rules,
      overrides,
      privateEvents,
      filteredSessions,
      users,
      useCodenames,
      filteredStubSessions,
      allStubs,
      bufferMinutes,
    ],
  );

  // Real sessions + offline-client (stub) sessions on one shape, so the donuts
  // and totals below count both whenever the client filter isn't narrowed to a
  // single real client. See schedulerOverviewUtils for the normalisation.
  const overviewSessions = useMemo(
    () => toOverviewSessions(filteredSessions, filteredStubSessions),
    [filteredSessions, filteredStubSessions],
  );

  const stats = useMemo(() => computeOverviewStats(overviewSessions), [overviewSessions]);

  // Session list below the calendar. `scope` decides which slice shows:
  //   upcoming — still to come, soonest first (the default)
  //   past     — already happened, most recent first (the old "history" view)
  //   all      — everything, most recent first
  const HISTORY_PAGE_SIZE = 10;
  const [historyPage, setHistoryPage] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the page only when the client filter or scope changes, not on every realtime session update
  useEffect(() => {
    setHistoryPage(1);
  }, [selectedClientId, scope]);

  const scopedSessions = useMemo(() => filterAndSortByScope(filteredSessions, scope), [filteredSessions, scope]);
  const scopedStubSessions = useMemo(
    () => filterAndSortByScope(filteredStubSessions, scope),
    [filteredStubSessions, scope],
  );

  // Real and offline-client (stub) sessions interleaved into one list, sorted the
  // same way filterAndSortByScope sorts each: upcoming = soonest first, past and
  // all = most recent first. Both `filtered*` arrays already respect the client filter, so
  // "All clients" shows both, a real client shows only real, a stub only stub.
  type SessionListRow = { kind: "real"; session: Session } | { kind: "stub"; session: StubSession };
  const scopedRows = useMemo<SessionListRow[]>(() => {
    const rows: SessionListRow[] = [
      ...scopedSessions.map((s): SessionListRow => ({ kind: "real", session: s })),
      ...scopedStubSessions.map((s): SessionListRow => ({ kind: "stub", session: s })),
    ];
    return rows.sort((a, b) => {
      const diff = new Date(a.session.scheduled_at).getTime() - new Date(b.session.scheduled_at).getTime();
      return scope === "upcoming" ? diff : -diff;
    });
  }, [scopedSessions, scopedStubSessions, scope]);

  const historyTotal = scopedRows.length;
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));

  const pageRows = useMemo(
    () => scopedRows.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE),
    [scopedRows, historyPage],
  );

  // A stub session's ordinal within its own client's history (not its position
  // in the merged list) — matches what the stub detail page shows.
  const stubSessionNumber = (target: StubSession) =>
    [...allStubSessions]
      .filter((s) => s.stub_id === target.stub_id)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      .findIndex((s) => s.id === target.id) + 1;

  const handleStubSessionUpdated = (updated: StubSession) =>
    setAllStubSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

  const handleStubSessionDeleted = (id: string) => setAllStubSessions((prev) => prev.filter((s) => s.id !== id));

  // ----- session totals: hours + remote vs in-person split for the selected
  // period (default all time). Scoped to the client filter, cancelled excluded.
  // Remote = anything not explicitly "in_person" (online/null), per SessionCard.
  const periodStats = useMemo(() => {
    const range = periodRange(period);
    return overviewSessions.reduce(
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
  }, [overviewSessions, period]);

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

  // Reset the whole click-to-create flow (chooser + whichever modal it opened).
  const closeSlotFlow = () => {
    setSlotStart(null);
    setSlotChoice(null);
  };

  const slotStartDay = slotStart ? dayjs(slotStart) : null;

  const closeNewSessionPicker = () => {
    setNewSessionWithoutId(false);
    setNewSessionClientId(null);
    closeSlotFlow();
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

  const handleEventDrop = ({ event, start, end }: EventInteractionArgs<SchedulerEvent>) => {
    const r = event.resource;
    if (r.type !== "session" && r.type !== "stub-session" && r.type !== "private") return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }

    if (r.type === "private") {
      // Private events have no client to notify and no overlap rules — just move
      // them, preserving the duration by shifting starts_at and ends_at together.
      const newStart = new Date(start as Date);
      const newEnd = new Date(end as Date);
      dispatch(
        updatePrivateEvent({
          id: r.event.id,
          starts_at: newStart.toISOString(),
          ends_at: newEnd.toISOString(),
        }),
      ).then((res) => {
        if (updatePrivateEvent.fulfilled.match(res)) showToast("Private event moved.");
        else showToast("Failed to move the event.", "danger");
      });
      return;
    }

    if (r.type === "stub-session") {
      const proposedStart = new Date(start as Date);
      const prevDate = r.stubSession.scheduled_at;

      if (
        hasSlotConflict({
          start: proposedStart,
          durationMinutes: r.stubSession.duration_minutes ?? 50,
          sessions,
          stubSessions: allStubSessions,
          excludeStubSessionId: r.stubSession.id,
        })
      ) {
        showToast("That slot overlaps with another session — pick a different time.", "danger");
        return;
      }

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
            // Offline clients with an email get the same reschedule notice as
            // real clients; the edge function no-ops when there's no email.
            supabase.functions.invoke("notify-stub-session-rescheduled", {
              body: { stub_session_id: r.stubSession.id, previous_date: prevDate },
            });
          }
        });
      return;
    }

    const proposedStart = new Date(start as Date);
    const { session } = r;

    // Checks real sessions AND offline-client (stub) sessions — same rule the DB
    // trigger enforces on the write.
    if (
      hasSlotConflict({
        start: proposedStart,
        durationMinutes: session.duration_minutes ?? 50,
        sessions,
        stubSessions: allStubSessions,
        excludeSessionId: session.id,
      })
    ) {
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

  // Session-list header — names who "this client" actually is instead of
  // leaving it generic, so switching the filter visibly changes the label.
  const selectedClientLabel = useMemo(() => {
    const prefix = { upcoming: "Upcoming", all: "All", past: "Recent" }[scope];
    if (selectedClientId === "all") return `${prefix} across all clients`;
    if (isStubSelected) {
      const stub = allStubs.find((s) => s.id === selectedStubId);
      if (!stub) return `${prefix} for this client`;
      const name = useCodenames
        ? stub.codename || `${stub.first_name} ${stub.last_name}`
        : `${stub.first_name} ${stub.last_name}`;
      return `${prefix} for ${name}`;
    }
    const client = clients.find((c) => c.id === selectedClientId);
    return client ? `${prefix} for ${clientDisplayName(client, useCodenames)}` : `${prefix} for this client`;
  }, [scope, selectedClientId, isStubSelected, selectedStubId, allStubs, clients, useCodenames]);

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
            <p className={styles.calendarHint}>
              Drag a session or private event to move it, click one to view and edit it, or click an empty slot to add
              something there.
            </p>

            <Card className={styles.calendarCard}>
              <SchedulerCalendar
                events={events}
                date={date}
                view={view}
                onNavigate={setDate}
                onView={setView}
                onSelectEvent={handleSelectEvent}
                onEventDrop={handleEventDrop}
                selectable
                onSelectSlot={({ start }) => {
                  setSlotChoice(null);
                  setSlotStart(start);
                }}
              />
            </Card>
          </CollapsibleSection>
        </Card>

        <Card className={styles.sectionCard}>
          <CollapsibleSection
            title="Sessions"
            storageKey="scheduler:history"
            headerRight={<span className={styles.historyMeta}>{selectedClientLabel}</span>}
          >
            <div className={styles.totalsHeader}>
              <SegmentedTabs tabs={SCOPES} value={scope} onChange={setScope} ariaLabel="Session list scope" />
            </div>
            {pageRows.length > 0 ? (
              <div className={styles.historyList}>
                {pageRows.map((row) => {
                  if (row.kind === "stub") {
                    return (
                      <StubSessionCard
                        key={`stub-${row.session.id}`}
                        session={row.session}
                        sessionNumber={stubSessionNumber(row.session)}
                        stubId={row.session.stub_id}
                        adminId={userProfile?.id ?? ""}
                        isDemo={isDemo}
                        onUpdated={handleStubSessionUpdated}
                        onDeleted={handleStubSessionDeleted}
                      />
                    );
                  }
                  const client = clients.find((c) => c.id === row.session.client_id);
                  return (
                    <SessionCard
                      key={row.session.id}
                      session={row.session}
                      isAdmin
                      isDemo={isDemo}
                      clientLabel={client ? clientDisplayName(client, useCodenames) : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <p className={styles.empty}>No {scope === "all" ? "" : `${scope} `}sessions.</p>
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
          title={(() => {
            const viewingClient = clients.find((c) => c.id === viewingSession.client_id);
            return viewingClient ? `Session with ${clientDisplayName(viewingClient, useCodenames)}` : "Session details";
          })()}
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
          initialStart={slotStartDay ?? undefined}
          onClose={() => {
            setNewSessionWithoutId(false);
            setNewSessionClientId(null);
            closeSlotFlow();
          }}
        />
      )}

      {/* Click-to-create: after clicking an empty slot, choose what to put there. */}
      {slotStart && !slotChoice && (
        <Modal
          title="Add to this time"
          size="sm"
          onClose={closeSlotFlow}
          actions={
            <Button variant="ghost" onClick={closeSlotFlow}>
              Cancel
            </Button>
          }
        >
          <p className={styles.modalIntro}>
            {dayjs(slotStart).format("dddd D MMM [at] h:mma")} — what would you like to add?
          </p>
          <div className={styles.slotChoices}>
            <Button
              onClick={() => {
                setSlotChoice("session");
                setNewSessionWithoutId(true);
              }}
            >
              Book a session
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSlotChoice("private");
                setEditingPrivate(null);
                setIsPrivateOpen(true);
              }}
            >
              Add a private event
            </Button>
          </div>
        </Modal>
      )}

      {/* The editor handles demo mode internally (writes are guarded + toasted). */}
      {isAvailabilityOpen && <AvailabilityEditor onClose={() => setIsAvailabilityOpen(false)} />}

      {isPrivateOpen && (
        <PrivateEventModal
          event={editingPrivate}
          initialStart={editingPrivate ? undefined : (slotStartDay ?? undefined)}
          onClose={() => {
            setIsPrivateOpen(false);
            closeSlotFlow();
          }}
        />
      )}
    </div>
  );
};

export default AdminScheduler;
