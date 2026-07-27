import { useMemo } from "react";
import { Link } from "react-router-dom";

import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { BookIcon, CheckIcon, ClipboardIcon, KeyIcon, RescheduleIcon, UsersIcon } from "@components/shared/Icons/Icons";
import WIP from "@components/shared/WIP/WIP";
import { useAuth } from "@context/AuthContext";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchQuestionnaires, selectAllQuestionnaires } from "@store/slices/questionnairesSlice";
import { fetchResources, selectAllResources } from "@store/slices/resourcesSlice";
import { fetchAllSessions } from "@store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import { isPageStatusLoading } from "@/Helpers/Helpers";
import TodoListCard from "../Blocks/TodoList/TodoListCard";

import styles from "./AdminDashboard.module.scss";

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const allClients = useAppSelector(selectClientUsers);
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const resources = useAppSelector(selectAllResources);

  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const resourcesStatus = useAppSelector((state: RootState) => state.resources.status);

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
  );

  useFetchOnIdle(
    (state: RootState) => state.questionnaires.status,
    () => fetchQuestionnaires(),
    "Failed to fetch questionnaires",
  );

  useFetchOnIdle(
    (state: RootState) => state.resources.status,
    () => fetchResources(),
    "Failed to fetch resources:",
  );

  useFetchOnIdle(
    (state: RootState) => state.sessions.status,
    () => fetchAllSessions(),
    "Failed to fetch sessions",
  );

  const allSessions = useAppSelector((state: RootState) => state.sessions.sessions);

  const nextSessionByClientId = useMemo(() => {
    const now = new Date();
    const map: Record<string, { paid: boolean; date: Date }> = {};
    for (const s of allSessions) {
      const sessionDate = new Date(s.scheduled_at);
      if (sessionDate <= now || s.status === "cancelled") continue;
      const clientId = s.client_id ?? "";
      const existing = map[clientId];
      if (!existing || sessionDate < existing.date) {
        map[clientId] = { paid: s.paid, date: sessionDate };
      }
    }
    return map;
  }, [allSessions]);

  const guard = isPageStatusLoading(usersStatus, questionnairesStatus, resourcesStatus);
  if (guard) return guard;

  const publishedResources = resources.filter((r) => r.is_published).length;
  const activeQs = questionnaires.filter((q) => q.is_active).length;

  const metrics = [
    {
      label: "Active clients",
      value: allClients.length,
      icon: <UsersIcon />,
      color: "stone",
      to: "/admin/clients",
    },
    {
      label: "Questionnaires",
      value: questionnaires.length,
      icon: <ClipboardIcon />,
      color: "stone",
      to: "/admin/questionnaires",
    },
    {
      label: "Active check-ins",
      value: activeQs,
      icon: <CheckIcon />,
      color: "stone",
      to: "/admin/questionnaires",
    },
    {
      label: "Published resources",
      value: publishedResources,
      icon: <BookIcon />,
      color: "stone",
      to: "/admin/resources",
    },
  ];

  const schedulerMetric = {
    label: "Scheduler",
    value: null,
    icon: <RescheduleIcon />,
    color: "stone",
    to: "/admin/scheduler",
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <div>
            <h1>Welcome back, {userProfile?.first_name}</h1>
            <p>Here's a summary of your practice portal</p>
          </div>
          <Card className={styles.quickActionsCard}>
            <p className={styles.quickActionsLabel}>Quick actions</p>
            <div className={styles.quickActionsRow}>
              <Link to="/admin/questionnaires?new=true" title="New questionnaire">
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
            </div>
          </Card>
        </div>

        {/* Metrics */}
        <div className={styles.metricsGrid}>
          {metrics.map((m) => (
            <Link key={m.label} to={m.to} style={{ textDecoration: "none" }}>
              <Card className={styles.metricCard}>
                <div className={`${styles.metricIcon} ${styles[m.color]}`}>{m.icon}</div>
                <p className={styles.metricValue}>{m.value ?? 0}</p>
                <p className={styles.metricLabel}>{m.label}</p>
              </Card>
            </Link>
          ))}
          <WIP>
            <Link to={schedulerMetric.to} style={{ textDecoration: "none" }}>
              <Card className={styles.metricCard}>
                <div className={`${styles.metricIcon} ${styles[schedulerMetric.color]}`}>{schedulerMetric.icon}</div>
                <p className={styles.metricValue}>{schedulerMetric.value ?? 0}</p>
                <p className={styles.metricLabel}>{schedulerMetric.label}</p>
              </Card>
            </Link>
          </WIP>
        </div>

        <div className={styles.bottomGrid}>
          {/* Clients */}
          <Card>
            <div className={styles.cardPad}>
              <div className={styles.cardHeader}>
                <h2>Your clients</h2>
                <Link to="/admin/clients" style={{ textDecoration: "none" }}>
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              </div>
              <div className={styles.clientList}>
                {allClients
                  .filter((user) => user.role === "client")
                  .slice(0, 4)
                  .map((u) => {
                    const nextSession = nextSessionByClientId[u.id];
                    return (
                      <Link key={u.id} to={`/admin/clients/${u.id}`} className={styles.clientRowLink}>
                        <div className={styles.clientRow}>
                          <Avatar name={u?.display_name || `${u.first_name} ${u.last_name}`} color="teal" size={36} />
                          <div className={styles.clientInfo}>
                            <p className={styles.clientName}>
                              {u.first_name} {u.last_name}
                            </p>
                            <p className={styles.clientMeta}>Joined {u.created_at?.split("T")[0]}</p>
                          </div>
                          {nextSession && (
                            <Badge variant={nextSession.paid ? "success" : "warning"}>
                              {nextSession.paid ? "Paid" : "Unpaid"}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                {allClients.length === 0 && <p className={styles.empty}>No clients yet. Add one to get started.</p>}
              </div>
            </div>
          </Card>

          {/* To-do list */}
          <TodoListCard />
        </div>
      </div>
    </div>
  );
}
