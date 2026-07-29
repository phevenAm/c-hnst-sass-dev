import { useEffect, useMemo, useState } from "react";
import type { View } from "react-big-calendar";
import { Views } from "react-big-calendar";
import { useSearchParams } from "react-router-dom";

import { Button, Card } from "@components/shared/index";
import SchedulerCalendar from "@components/shared/SchedulerCalendar/SchedulerCalendar";
import CreateSessionModal from "@components/shared/SessionCard/CreateSessionModal/CreateSessionModal";
import type { RootState } from "@/store";

import { isPageStatusLoading } from "@/Helpers/Helpers";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import type { Session, UserProfile } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchAllSessions } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectAllUsers } from "@/store/slices/userDirectorySlice";
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
// ============================================================

const AdminScheduler = () => {
  const dispatch = useAppDispatch();

  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<View>(Views.WORK_WEEK);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

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
  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  // ----- events
  const events = useMemo<SchedulerEvent[]>(
    () => [...availabilityEvents(date, rules, overrides), ...sessionEvents(sessions, users)],
    [date, rules, overrides, sessions, users],
  );

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
