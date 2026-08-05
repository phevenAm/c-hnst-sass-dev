import { useMemo } from "react";
import { Link } from "react-router-dom";

import { BookIcon, ClipboardIcon, KeyIcon, RescheduleIcon } from "@components/shared/Icons/Icons";
import { Card, CollapsibleSection, HideableSection } from "@components/shared/index";
import { useAuth } from "@context/AuthContext";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchAllSessions } from "@store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import { isPageStatusLoading } from "@/Helpers/Helpers";
import TodoListCard from "../Blocks/TodoList/TodoListCard";
import TrendChart from "./Blocks/TrendChart/TrendChart";
import UpcomingSessions from "./Blocks/UpcomingSessions/UpcomingSessions";
import { revenueByMonth, sessionsByWeek } from "./dashboardUtils";

import styles from "./AdminDashboard.module.scss";

export default function AdminDashboard() {
  const { userProfile, practiceSettings } = useAuth();
  const allClients = useAppSelector(selectClientUsers);
  const allSessions = useAppSelector((state: RootState) => state.sessions.sessions);

  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);

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

  const revenueData = useMemo(() => revenueByMonth(allSessions, 6), [allSessions]);
  const sessionVolumeData = useMemo(() => sessionsByWeek(allSessions, 8), [allSessions]);

  const guard = isPageStatusLoading(usersStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <div>
            <h1>Welcome back, {userProfile?.first_name}</h1>
            <p>Here's how your practice is doing</p>
          </div>
          <Card className={styles.quickActionsCard}>
            <p className={styles.quickActionsLabel}>Quick actions</p>
            <div className={styles.quickActionsRow}>
              <Link to="/admin/questionnaires?new=true" title="New survey">
                <div className={`${styles.metricIcon} ${styles.teal}`}>
                  <ClipboardIcon />
                </div>
              </Link>
              <Link to="/admin/resources?new=true" title="New resource">
                <div className={`${styles.metricIcon} ${styles.stone}`}>
                  <BookIcon />
                </div>
              </Link>
              <Link to="/admin/clients?new=true" title="Create sign-up token">
                <div className={`${styles.metricIcon} ${styles.coral}`}>
                  <KeyIcon />
                </div>
              </Link>
              <Link to="/admin/scheduler?availability=1" title="Manage availability">
                <div className={`${styles.metricIcon} ${styles.teal}`}>
                  <RescheduleIcon />
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
            limit={6}
          />
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
