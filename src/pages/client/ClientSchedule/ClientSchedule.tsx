import { useCallback, useEffect, useMemo, useState } from "react";
import type { View } from "react-big-calendar";
import { Views } from "react-big-calendar";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "@context/AuthContext";
import { RootState } from "@/store";

import { Card, NextSessionCard, SessionCard, ToggleButtonTabs } from "@/components/shared";
import { BlockSessionCard } from "@/components/shared/BlockSessionCard/BlockSessionCard";
import Button from "@/components/shared/Button/Button";
import Modal from "@/components/shared/Modal/Modal";
import SchedulerCalendar from "@/components/shared/SchedulerCalendar/SchedulerCalendar";
import {
  availabilityEvents,
  bookableWindowsForDate,
  clientSessionEvents,
  type SchedulerEvent,
} from "@/components/shared/SchedulerCalendar/schedulerUtils";
import { ToggleButtonTabsTypes } from "@/components/shared/ToggleButtonTabs/ToggleButtonTabs";
import { useToast } from "@/context/ToastContext";
import { isPageStatusLoading } from "@/Helpers/Helpers";
import { groupSessionsForDisplay, type SessionRenderItem } from "@/Helpers/sessionGrouping";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import type { Session } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";

import styles from "./ClientSchedule.module.scss";

const ClientSchedule = () => {
  const { userProfile, isDemo, isAdmin } = useAuth();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTabs, setActiveTabs] = useState<"past" | "upcoming">("upcoming");
  const [showCalendar, setShowCalendar] = useState(() => localStorage.getItem("clientSessionsView") !== "list");
  const [calDate, setCalDate] = useState<Date>(new Date());
  const [calView, setCalView] = useState<View>(Views.WORK_WEEK);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const handleViewChange = (calendar: boolean) => {
    setShowCalendar(calendar);
    localStorage.setItem("clientSessionsView", calendar ? "calendar" : "list");
  };

  useEffect(() => {
    const paymentStatus = searchParams.get("payment");

    if (paymentStatus === "success") {
      showToast("Payment successful — your session is confirmed.", "success");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast]);

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    userProfile ? () => fetchSessionsByClientId(userProfile.id) : null,
    "Failed to fetch client's sessions",
  );

  // Availability powers the calendar view — the client's own RLS lets them read
  // their counsellor's rules + overrides, so they can see open/blocked windows.
  useFetchOnIdle((state: RootState) => state.availability.status, fetchAvailability, "Failed to fetch availability");

  // Practice settings — read only for the counsellor's session-buffer length so
  // the calendar's post-session strips match what the admin sees.
  useFetchOnIdle(
    (state: RootState) => state.practiceSettings.status,
    fetchPracticeSettings,
    "Failed to fetch practice settings",
  );
  const bufferMinutes = useAppSelector((state) => state.practiceSettings.data?.session_buffer_minutes ?? 10);

  useRealtimeTable("sessions", userProfile?.id ? `client_id=eq.${userProfile.id}` : undefined, () =>
    dispatch(fetchSessionsByClientId(userProfile!.id)),
  );

  const rules = useAppSelector((state) => state.availability.rules);
  const overrides = useAppSelector((state) => state.availability.overrides);

  const sessionStatus = useAppSelector((state) => state.sessions.status);
  const mySessions = (useAppSelector((state) => state.sessions.sessions) ?? [])
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  // Deliberately not filtering out cancelled here — the featured slot below
  // shows whichever session is chronologically next, cancelled or not, so a
  // client sees "your next session was cancelled" clearly instead of it just
  // vanishing (NextSessionCard hides all actions and shows a Cancelled badge
  // for it). A cancelled session never keeps its actionable slot for long in
  // practice since the client's real next session then renders right below
  // it in the list.
  const upcomingSessions = useMemo(
    () => mySessions.filter((s) => new Date(s.scheduled_at) >= new Date()),
    [mySessions],
  );
  const pastSessions = useMemo(() => mySessions.filter((s) => new Date(s.scheduled_at) < new Date()), [mySessions]);

  const tabsObj: ToggleButtonTabsTypes = {
    leftButtonAction: () => setActiveTabs("past"),
    leftButtonTitle: "Past sessions",
    rightButtonTitle: "Upcoming sessions",
    rightButtonAction: () => setActiveTabs("upcoming"),
    activeTab: activeTabs === "past" ? "left" : "right",
  };

  // Calendar events: the client's own sessions + their counsellor's windows.
  const calendarEvents = useMemo(
    () => [...availabilityEvents(calDate, rules, overrides), ...clientSessionEvents(mySessions, bufferMinutes)],
    [calDate, rules, overrides, mySessions, bufferMinutes],
  );

  // Darken time slots that fall outside the admin's availability windows.
  // Slots covered by a booked session stay ungreyed even if outside availability.
  const slotPropGetter = useCallback(
    (slotDate: Date) => {
      const windows = bookableWindowsForDate(slotDate, rules, overrides);
      const isAvailable = windows.some(
        (w) => slotDate.getTime() >= w.start.getTime() && slotDate.getTime() < w.end.getTime(),
      );
      if (isAvailable) return {};

      const slotMs = slotDate.getTime();
      const hasSession = mySessions.some((s) => {
        if (s.status === "cancelled") return false;
        const start = new Date(s.scheduled_at).getTime();
        const end = start + (s.duration_minutes ?? 50) * 60_000;
        return slotMs >= start && slotMs < end;
      });

      return hasSession ? {} : { className: "cal-slot-blocked" };
    },
    [rules, overrides, mySessions],
  );

  // Clicking a session chip on the calendar opens the same detail/action card
  // used in list view — availability windows and the buffer strip aren't
  // clickable, there's nothing for a client to do with those.
  const handleSelectEvent = useCallback((event: SchedulerEvent) => {
    const r = event.resource;
    if (r.type === "session" || r.type === "cancelled-session") {
      setSelectedSession(r.session);
    }
  }, []);

  const guard = isPageStatusLoading(sessionStatus);
  if (guard) return guard;

  // upcomingSessions[0] is featured in the strip above, so list starts at [1]
  const sessionsToRender = activeTabs === "past" ? pastSessions : upcomingSessions.slice(1);

  // Only the upcoming tab groups block sessions into a BlockSessionCard —
  // past sessions always render individually (see groupSessionsForDisplay's
  // own comment for why).
  const renderItems =
    activeTabs === "past"
      ? sessionsToRender.map((session): SessionRenderItem => ({ kind: "single", session }))
      : groupSessionsForDisplay(sessionsToRender);

  let emptyMessage = "Nothing booked yet";

  if (activeTabs === "past") {
    emptyMessage = "No past sessions";
  } else if (upcomingSessions.length > 0) {
    emptyMessage = "No other upcoming sessions";
  }

  return (
    <div className={`page${showCalendar ? ` ${styles.calendarPage}` : ""}`}>
      <div className="inner">
        <div className={styles.headingRow} id="sessions-header">
          <h1 className={styles.heading}>My Sessions</h1>
          <div className={styles.viewToggle} id="sessions-view-toggle">
            <Button size="sm" variant={showCalendar ? "ghost" : "primary"} onClick={() => handleViewChange(false)}>
              List
            </Button>
            <Button size="sm" variant={showCalendar ? "primary" : "ghost"} onClick={() => handleViewChange(true)}>
              Calendar
            </Button>
          </div>
        </div>

        {/* TODO Section 5 — client attendance summary
            Add a small stat strip here between the heading and the next session card.
            Show: sessions attended · sessions missed · attendance %
            Data comes from allSessions (already fetched) — filter by attended field.
            Keep it encouraging, not clinical. Admin aggregate view lives in AdminScheduler. */}

        <div className={styles.nextSlot}>
          {upcomingSessions[0] ? (
            <NextSessionCard session={upcomingSessions[0]} />
          ) : (
            <Card className={styles.nextStrip}>
              <p className={styles.noUpcoming}>No upcoming sessions booked</p>
            </Card>
          )}
        </div>

        {showCalendar ? (
          <>
            <p className={styles.calendarHint}>Click a session to view its details and manage it.</p>
            <Card className={`${styles.calendarCard} ${styles.calendarCardFill}`}>
              <SchedulerCalendar
                events={calendarEvents}
                date={calDate}
                view={calView}
                onNavigate={setCalDate}
                onView={setCalView}
                onSelectEvent={handleSelectEvent}
                slotPropGetter={slotPropGetter}
                height="100%"
              />
            </Card>
          </>
        ) : (
          <Card className={styles.sessionsList}>
            <div className={styles.tabContainer}>
              <ToggleButtonTabs {...tabsObj} />
            </div>
            {sessionsToRender.length === 0 ? (
              <p className={styles.emptyList}>{emptyMessage}</p>
            ) : (
              <div className={styles.scrollable}>
                {renderItems.map((item) =>
                  item.kind === "block" ? (
                    <BlockSessionCard
                      key={item.sessions[0].id}
                      sessions={item.sessions}
                      isAdmin={isAdmin}
                      isDemo={isDemo}
                    />
                  ) : (
                    <SessionCard key={item.session.id} session={item.session} isAdmin={isAdmin} isDemo={isDemo} />
                  ),
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      {selectedSession && (
        <Modal title="Session details" onClose={() => setSelectedSession(null)} size="md">
          <SessionCard session={selectedSession} isAdmin={isAdmin} isDemo={isDemo} />
        </Modal>
      )}
    </div>
  );
};

export default ClientSchedule;
