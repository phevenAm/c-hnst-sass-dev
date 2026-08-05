import { useMemo, useState } from "react";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import { Card, CollapsibleSection } from "@components/shared/index";
import { SessionCard } from "@components/shared/SessionCard/SessionCard";
import type { RootState } from "@/store";

import { useAuth } from "@/context/AuthContext";
import { isPageStatusLoading } from "@/Helpers/Helpers";
import TrendChart from "@/pages/admin/AdminDashboard/Blocks/TrendChart/TrendChart";
import { revenueByMonth } from "@/pages/admin/AdminDashboard/dashboardUtils";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchAllSessions } from "@/store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";

import styles from "./AdminPaymentsPage.module.scss";

const AdminPaymentsPage = () => {
  const { isDemo } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState("all");

  useFetchOnIdle((s: RootState) => s.sessions.status, fetchAllSessions, "Failed to load sessions");
  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load users");

  const sessions = useAppSelector((s) => s.sessions.sessions);
  const clients = useAppSelector(selectClientUsers);
  const sessionsStatus = useAppSelector((s: RootState) => s.sessions.status);

  const filteredSessions = useMemo(
    () => (selectedClientId === "all" ? sessions : sessions.filter((s) => s.client_id === selectedClientId)),
    [sessions, selectedClientId],
  );

  const stats = useMemo(
    () =>
      filteredSessions.reduce(
        (acc, s) => {
          if (s.status === "cancelled") return acc;
          if (s.paid) {
            acc.collectedPence += s.price_pence ?? 0;
            acc.paidCount += 1;
          } else {
            acc.outstandingPence += s.price_pence ?? 0;
            acc.unpaidCount += 1;
          }
          return acc;
        },
        { collectedPence: 0, outstandingPence: 0, paidCount: 0, unpaidCount: 0 },
      ),
    [filteredSessions],
  );

  const unpaidSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => !s.paid && s.status !== "cancelled")
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [filteredSessions],
  );

  const paidSessions = useMemo(
    () =>
      filteredSessions
        .filter((s) => s.paid)
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 25),
    [filteredSessions],
  );

  const revenueData = useMemo(() => revenueByMonth(filteredSessions, 6), [filteredSessions]);

  const paymentSlices: DonutSlice[] = [
    { name: "Paid", value: stats.paidCount, color: "#2d7264" },
    { name: "Unpaid", value: stats.unpaidCount, color: "#c98a2b" },
  ];

  const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

  const guard = isPageStatusLoading(sessionsStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>Payments</h1>
            <p className={styles.subheading}>Revenue collected, outstanding balances, and payment history.</p>
          </div>
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
        </div>

        <CollapsibleSection title="Summary" storageKey="payments:summary">
          <div className={styles.statsGrid}>
            {[
              { label: "Collected", value: money(stats.collectedPence), tone: styles.toneGood },
              { label: "Outstanding", value: money(stats.outstandingPence), tone: styles.toneWarn },
              { label: "Paid sessions", value: stats.paidCount, tone: "" },
              { label: "Unpaid sessions", value: stats.unpaidCount, tone: "" },
            ].map((s) => (
              <Card key={s.label} className={styles.statCard}>
                <p className={`${styles.statValue} ${s.tone}`}>{s.value}</p>
                <p className={styles.statLabel}>{s.label}</p>
              </Card>
            ))}
          </div>
          <div className={styles.chartsGrid}>
            <TrendChart
              title="Revenue (last 6 months)"
              data={revenueData}
              type="bar"
              color="#2d7264"
              valueFormatter={(v) => `£${v.toFixed(2)}`}
            />
            <DonutChart
              title="Paid vs unpaid"
              slices={paymentSlices}
              centerValue={money(stats.collectedPence)}
              centerLabel="collected"
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title={`Outstanding${stats.unpaidCount > 0 ? ` (${stats.unpaidCount})` : ""}`}
          storageKey="payments:outstanding"
          headerRight={
            stats.unpaidCount > 0 ? (
              <span className={styles.warningBadge}>{money(stats.outstandingPence)} owed</span>
            ) : undefined
          }
        >
          {unpaidSessions.length > 0 ? (
            <div className={styles.sessionList}>
              {unpaidSessions.map((session) => (
                <SessionCard key={session.id} session={session} isAdmin isDemo={isDemo} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No outstanding payments.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Payment history" storageKey="payments:history">
          {paidSessions.length > 0 ? (
            <div className={styles.sessionList}>
              {paidSessions.map((session) => (
                <SessionCard key={session.id} session={session} isAdmin isDemo={isDemo} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No paid sessions yet.</p>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default AdminPaymentsPage;
