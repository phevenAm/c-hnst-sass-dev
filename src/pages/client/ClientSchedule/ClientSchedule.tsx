import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import { useAuth } from "@context/AuthContext";
import { RootState } from "@/store";

import { Badge, Card, SessionCard, ToggleButtonTabs } from "@/components/shared";
import Button from "@/components/shared/Button/Button";
import PaymentModal from "@/components/shared/PaymentModal/PaymentModal";
import CancelSessionModal from "@/components/shared/SessionCard/CancelSessionModal/CancelSessionModal";
import ClientRescheduleModal from "@/components/shared/SessionCard/ClientRescheduleModal/ClientRescheduleModal";
import useSessionCard from "@/components/shared/SessionCard/useSessionCard";
import { ToggleButtonTabsTypes } from "@/components/shared/ToggleButtonTabs/ToggleButtonTabs";
import { useToast } from "@/context/ToastContext";
import { isPageStatusLoading } from "@/Helpers/Helpers";
import { useRealtimeTable } from "@/Hooks/useRealtimeTable";
import type { Session } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";

import styles from "./ClientSchedule.module.scss";

function formatStripDate(session: Session): string {
  const scheduled = dayjs(session.scheduled_at);
  if (scheduled.isSame(dayjs(), "day")) return `Today at ${scheduled.format("h:mma")}`;
  if (scheduled.isSame(dayjs().add(1, "day"), "day")) return `Tomorrow at ${scheduled.format("h:mma")}`;
  return scheduled.format("dddd D MMM · h:mma");
}

function NextSessionStrip({ session }: { session: Session }) {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const { showToast } = useToast();
  const { isWithin48Hours } = useSessionCard(session);
  const { isDemo } = useAuth();

  const isOnline = session.location !== "in_person";

  const guardAction = (fn: () => void) => {
    if (isWithin48Hours) {
      showToast("Sessions cannot be changed within 48 hours of the appointment", "warning");
      return;
    }
    fn();
  };

  return (
    <>
      <Card className={styles.nextStrip}>
        <div className={styles.stripLeft}>
          <p className={styles.stripDate}>{formatStripDate(session)}</p>
          <div className={styles.stripMeta}>
            <span>{session.duration_minutes} min</span>
            <span>·</span>
            <span>{isOnline ? "Online" : "In person"}</span>
            {session.address && (
              <>
                <span>·</span>
                {isOnline ? (
                  <a href={session.address} target="_blank" rel="noreferrer" className={styles.joinLink}>
                    Join meeting
                  </a>
                ) : (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(session.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.joinLink}
                  >
                    {session.address}
                  </a>
                )}
              </>
            )}
            {session.price_pence > 0 && (
              <>
                <span>·</span>
                <span>£{(session.price_pence / 100).toFixed(2)}</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.stripRight}>
          <Badge variant={session.paid ? "success" : "warning"}>{session.paid ? "Paid" : "Unpaid"}</Badge>
          <Button
            size="sm"
            variant="primary"
            disabled={isDemo || session.paid}
            onClick={() => guardAction(() => setIsPayModalOpen(true))}
          >
            Pay
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isDemo}
            onClick={() => guardAction(() => setIsRescheduleModalOpen(true))}
          >
            Reschedule
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isDemo}
            onClick={() => guardAction(() => setIsCancelModalOpen(true))}
          >
            Cancel
          </Button>
        </div>
      </Card>

      {isPayModalOpen && <PaymentModal session={session} onClose={() => setIsPayModalOpen(false)} />}
      {isRescheduleModalOpen && (
        <ClientRescheduleModal session={session} onClose={() => setIsRescheduleModalOpen(false)} />
      )}
      {isCancelModalOpen && <CancelSessionModal session={session} onClose={() => setIsCancelModalOpen(false)} />}
    </>
  );
}

const ClientSchedule = () => {
  const { userProfile, isDemo, isAdmin } = useAuth();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTabs, setActiveTabs] = useState<"past" | "upcoming">("upcoming");

  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      showToast("Payment successful — your session is confirmed.", "success");
      setSearchParams({}, { replace: true });
    }
  }, []);

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    userProfile ? () => fetchSessionsByClientId(userProfile.id) : null,
    "Failed to fetch client's sessions",
  );

  useRealtimeTable("sessions", userProfile?.id ? `client_id=eq.${userProfile.id}` : undefined, () =>
    dispatch(fetchSessionsByClientId(userProfile!.id)),
  );

  const sessionStatus = useAppSelector((state) => state.sessions.status);
  const mySessions = (useAppSelector((state) => state.sessions.sessions) ?? [])
    .slice()
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

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

  const guard = isPageStatusLoading(sessionStatus);
  if (guard) return guard;

  // upcomingSessions[0] is featured in the strip above, so list starts at [1]
  const sessionsToRender = activeTabs === "past" ? pastSessions : upcomingSessions.slice(1);

  let emptyMessage = "Nothing booked yet";

  if (activeTabs === "past") {
    emptyMessage = "No past sessions";
  } else if (upcomingSessions.length > 0) {
    emptyMessage = "No other upcoming sessions";
  }

  return (
    <div className="page">
      <div className="inner">
        <h1 className={styles.heading}>My Sessions</h1>

        {/* TODO Section 5 — client attendance summary
            Add a small stat strip here between the heading and the next session card.
            Show: sessions attended · sessions missed · attendance %
            Data comes from allSessions (already fetched) — filter by attended field.
            Keep it encouraging, not clinical. Admin aggregate view lives in AdminScheduler. */}

        {upcomingSessions[0] ? (
          <NextSessionStrip session={upcomingSessions[0]} />
        ) : (
          <Card className={styles.nextStrip}>
            <p className={styles.noUpcoming}>No upcoming sessions booked</p>
          </Card>
        )}

        <Card className={styles.sessionsList}>
          <div className={styles.tabContainer}>
            <ToggleButtonTabs {...tabsObj} />
          </div>
          {sessionsToRender.length === 0 ? (
            <p className={styles.emptyList}>{emptyMessage}</p>
          ) : (
            <div className={styles.scrollable}>
              {sessionsToRender.map((session) => (
                <SessionCard key={session.id} session={session} isAdmin={isAdmin} isDemo={isDemo} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ClientSchedule;
