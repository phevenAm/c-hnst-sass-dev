import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import dayjs from "dayjs";

import { useRealtimeTable } from "@Hooks/useRealtimeTable";
import Avatar from "@components/shared/Avatar/Avatar";
import { BookIcon, CreateSession, FormsIcon, KeyIcon, RescheduleIcon } from "@components/shared/Icons/Icons";
import { Card, CollapsibleSection, HideableSection } from "@components/shared/index";
import UpdateBanner from "@components/shared/UpdateBanner/UpdateBanner";
import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchAllSessions } from "@store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import { clientDisplayName, isPageStatusLoading, pickColor } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import type { ClientStub } from "@/models/globalTypes";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import TodoListCard from "../Blocks/TodoList/TodoListCard";
import TrendChart from "./Blocks/TrendChart/TrendChart";
import UpcomingSessions from "./Blocks/UpcomingSessions/UpcomingSessions";
import { revenueByMonth, sessionsByWeek } from "./dashboardUtils";

import styles from "./AdminDashboard.module.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientView = {
  client_type: "user" | "stub";
  client_ref: string;
  viewed_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor(diff / 60_000);
  if (days > 30) return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${Math.max(1, mins)}m ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { userProfile, practiceSettings } = useAuth();
  const allClients = useAppSelector(selectClientUsers);
  const allStubs = useAppSelector(selectAllStubs);
  const allSessions = useAppSelector((state: RootState) => state.sessions.sessions);
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const sessionsStatus = useAppSelector((state: RootState) => state.sessions.status);
  const dispatch = useAppDispatch();

  const [recentViews, setRecentViews] = useState<ClientView[]>([]);

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
  );

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    () => fetchAllSessions(),
    "Failed to fetch sessions",
  );

  useFetchOnIdle(
    (state: RootState) => state.clientStubs.status,
    () => fetchClientStubs(),
    "Failed to fetch offline clients",
  );

  useRealtimeTable("sessions", "duration_minutes=gte.0", () => dispatch(fetchAllSessions()));

  useEffect(() => {
    supabase
      .from("client_views")
      .select("client_type, client_ref, viewed_at")
      .order("viewed_at", { ascending: false })
      .limit(4)
      .then(({ data }) => {
        if (data) setRecentViews(data as ClientView[]);
      });
  }, []);

  const revenueData = useMemo(() => revenueByMonth(allSessions, 6), [allSessions]);
  const sessionVolumeData = useMemo(() => sessionsByWeek(allSessions, 8), [allSessions]);

  const unpaidSessions = useMemo(
    () =>
      allSessions
        .filter((s) => !s.paid && s.status !== "cancelled" && dayjs(s.scheduled_at).isBefore(dayjs()))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 5),
    [allSessions],
  );

  const guard = isPageStatusLoading(usersStatus, sessionsStatus);
  if (guard) return guard;

  const getClientName = (clientId: string | null): string => {
    if (!clientId) return "Unknown";
    const c = allClients.find((x) => x.id === clientId);
    return c ? clientDisplayName(c, useCodenames) : "Unknown";
  };

  const getViewName = (v: ClientView): string => {
    if (v.client_type === "user") {
      const c = allClients.find((x) => x.id === v.client_ref);
      return c ? clientDisplayName(c, useCodenames) : "Unknown client";
    }
    const s = allStubs.find((x) => x.id === v.client_ref);
    if (!s) return "Unknown client";
    return useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;
  };

  const getViewHref = (v: ClientView): string =>
    v.client_type === "user" ? `/admin/clients/${v.client_ref}` : `/admin/clients/stub/${v.client_ref}`;

  return (
    <div className="page">
      <UpdateBanner />
      <div className="inner">
        <div className={styles.header} id="dash-header">
          <div>
            <h1>Welcome back, {userProfile?.first_name}</h1>
            <p>Here's how your practice is doing</p>
          </div>
          <Card className={styles.quickActionsCard} id="dash-quick-actions">
            <p className={styles.quickActionsLabel}>Quick actions</p>
            <div className={styles.quickActionsRow}>
              <Link to="/admin/scheduler?newSession=1" title="Create a new session">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <CreateSession />
                </div>
              </Link>

              <Link to="/admin/scheduler?availability=1" title="Manage availability">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <RescheduleIcon />
                </div>
              </Link>

              <Link to="/admin/forms?new=true" title="Create a new form">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <FormsIcon />
                </div>
              </Link>

              <Link to="/admin/clients?new=true" title="Create sign-up token">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <KeyIcon />
                </div>
              </Link>
            </div>
          </Card>
        </div>

        <CollapsibleSection
          title="Upcoming sessions"
          storageKey="dash:upcoming"
          headerRight={
            <Link to="/admin/scheduler" className={styles.sectionLink}>
              Open schedule
            </Link>
          }
        >
          <UpcomingSessions
            sessions={allSessions}
            clients={allClients}
            useCodenames={practiceSettings?.use_client_codenames ?? false}
            limit={2}
          />
        </CollapsibleSection>

        {/* ── Outstanding payments ── */}
        <CollapsibleSection
          title={`Outstanding payments${unpaidSessions.length > 0 ? ` (${unpaidSessions.length})` : ""}`}
          storageKey="dash:invoices"
          headerRight={
            unpaidSessions.length > 0 ? (
              <Link to="/admin/payments" className={styles.sectionLink}>
                View all →
              </Link>
            ) : undefined
          }
        >
          {unpaidSessions.length === 0 ? (
            <p className={styles.empty}>No outstanding payments — all clear.</p>
          ) : (
            <div className={styles.invoiceList}>
              {unpaidSessions.map((s) => {
                const daysOverdue = dayjs().diff(dayjs(s.scheduled_at), "day");
                return (
                  <Link key={s.id} to="/admin/payments" className={styles.invoiceRowLink}>
                    <div className={styles.invoiceRow}>
                      <div className={styles.invoiceInfo}>
                        <span className={styles.invoiceClient}>{getClientName(s.client_id)}</span>
                        <span className={styles.invoiceOverdue}>{daysOverdue}d overdue</span>
                      </div>
                      <span className={styles.invoiceAmount}>
                        {s.price_pence ? `£${(s.price_pence / 100).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        {/* ── Recent clients ── */}
        <CollapsibleSection
          title="Recent clients"
          storageKey="dash:recent"
          headerRight={
            <Link to="/admin/clients" className={styles.sectionLink}>
              View all →
            </Link>
          }
        >
          {recentViews.length === 0 ? (
            <p className={styles.empty}>No recently viewed clients yet.</p>
          ) : (
            <div className={styles.recentGrid}>
              {recentViews.map((v) => {
                const name = getViewName(v);
                return (
                  <Link key={`${v.client_type}-${v.client_ref}`} to={getViewHref(v)} className={styles.recentCardLink}>
                    <div className={styles.recentCard}>
                      <Avatar name={name} color={pickColor(v.client_ref)} size={36} />
                      <div className={styles.recentInfo}>
                        <p className={styles.recentName}>{name}</p>
                        <p className={styles.recentMeta}>{timeAgo(v.viewed_at)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Practice trends" storageKey="dash:trends">
          <div className={styles.chartsGrid}>
            <HideableSection id="dashboard-revenue">
              <TrendChart
                title="Revenue (last 6 months)"
                data={revenueData}
                type="bar"
                color="#4a665b"
                valueFormatter={(v) => `£${v.toFixed(2)}`}
              />
            </HideableSection>
            <TrendChart title="Sessions per week" data={sessionVolumeData} type="bar" color="#5f8073" />
          </div>
        </CollapsibleSection>

        <HideableSection id="dashboard-todos">
          <CollapsibleSection title="To-dos" storageKey="dash:todos">
            <TodoListCard embedded />
          </CollapsibleSection>
        </HideableSection>
      </div>
    </div>
  );
}
