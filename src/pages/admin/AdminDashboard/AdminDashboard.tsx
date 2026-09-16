import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import dayjs from "dayjs";

import { useRealtimeTable } from "@Hooks/useRealtimeTable";
import Avatar from "@components/shared/Avatar/Avatar";
import {
  ChatIcon,
  CreateSession,
  FormsIcon,
  MailIcon,
  MegaphoneIcon,
  MoneyIcon,
  RescheduleIcon,
} from "@components/shared/Icons/Icons";
import { Card, CollapsibleSection, HideableSection, NotificationBadge } from "@components/shared/index";
import SendAnnouncementModal from "@components/shared/SendAnnouncementModal/SendAnnouncementModal";
import SeriesToggleChips from "@components/shared/SeriesToggleChips/SeriesToggleChips";
import { useAuth } from "@context/AuthContext";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchAllSessions } from "@store/slices/sessionsSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import { clientDisplayName, isPageStatusLoading, pickColor } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import { bucketCount, bucketTrend } from "@/pages/admin/AdminFinancesPage/financeOverview";
import TrendControls from "@/pages/admin/AdminFinancesPage/TrendControls";
import { useTrendControls } from "@/pages/admin/AdminFinancesPage/useTrendControls";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import TodoListCard from "../Blocks/TodoList/TodoListCard";
import TrendChart, { type TrendSeries } from "./Blocks/TrendChart/TrendChart";
import UpcomingSessions, { type UpcomingStubSession } from "./Blocks/UpcomingSessions/UpcomingSessions";
import { paidPaymentRows, paidSessionRows, paidStubSessionRows } from "./dashboardUtils";

import styles from "./AdminDashboard.module.scss";

// ── Types ─────────────────────────────────────────────────────────────────────

type PendingRequest =
  | { kind: "reschedule"; id: string; client_id: string; requested_at: string; created_at: string }
  | { kind: "cancellation"; id: string; client_id: string; created_at: string };

// Revenue/Outgoings (money, lines) used to share one dual-axis chart with
// Sessions (a count, was tried as both a bar and a line) — a count on its
// own much smaller axis either filled almost the full chart height (as a
// bar) or read as visually unrelated to the money lines it sat next to on a
// totally different scale. Split into its own single-axis chart instead
// (see .trendsRow in the stylesheet) rather than keep forcing two different
// kinds of measurement onto one plot.
// --highlight is the design system's own "second accent" (see _colors.scss)
// — a warm terracotta reserved for decorative use, explicitly not buttons,
// which fits a chart line far better than it fit the muddy brown it
// replaced here.
const REVENUE_SERIES: TrendSeries[] = [
  { key: "Revenue", name: "Revenue", color: "var(--accent)", kind: "line", valueFormatter: (v) => `£${v.toFixed(2)}` },
  {
    key: "Outgoings",
    name: "Outgoings",
    color: "var(--highlight)",
    kind: "line",
    valueFormatter: (v) => `£${v.toFixed(2)}`,
  },
];

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
  const { userProfile, practiceSettings, isDemo, updatePracticeSettingsLocal } = useAuth();
  const allClients = useAppSelector(selectClientUsers);
  const allStubs = useAppSelector(selectAllStubs);
  const allSessions = useAppSelector((state: RootState) => state.sessions.sessions);
  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const [announceOpen, setAnnounceOpen] = useState(false);

  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const sessionsStatus = useAppSelector((state: RootState) => state.sessions.status);
  const sessionsScope = useAppSelector((state: RootState) => state.sessions.scope);
  const dispatch = useAppDispatch();

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  // Revenue chart needs paid stub sessions + manual payments alongside
  // `allSessions`, or offline-client and manually-recorded (cash/bank
  // transfer) payments silently don't count towards revenue — see the same
  // fix on AdminPaymentsPage.
  const [stubSessions, setStubSessions] = useState<
    (UpcomingStubSession & { amount_paid: number | null; price_pence: number | null })[]
  >([]);
  const [manualPayments, setManualPayments] = useState<{ paid_at: string; amount_pence: number }[]>([]);
  const [expenses, setExpenses] = useState<{ incurred_on: string; amount_pence: number }[]>([]);

  // "Practice trends" legend toggle — persisted to practice_settings
  // (keyed by chart id, since the Finance page's Overview chart reuses this
  // same column) so it survives a reload instead of resetting like plain
  // component state would. Demo's shared row never gets a real write — same
  // guard as AdminSetupPage's demo path — so the toggle there only lasts
  // the current tab.
  const hiddenTrendKeys = useMemo(
    () => new Set(practiceSettings?.hidden_chart_series?.practiceTrends ?? []),
    [practiceSettings?.hidden_chart_series],
  );
  const toggleTrendSeries = (key: string) => {
    const currentForChart = new Set(practiceSettings?.hidden_chart_series?.practiceTrends ?? []);
    if (currentForChart.has(key)) currentForChart.delete(key);
    else currentForChart.add(key);
    const next = { ...practiceSettings?.hidden_chart_series, practiceTrends: Array.from(currentForChart) };
    updatePracticeSettingsLocal({ hidden_chart_series: next });
    if (!isDemo && userProfile?.id) {
      // Postgrest's query builder is a lazy thenable — building it (even
      // with `void` in front) never sends anything; only calling .then()
      // (or awaiting it) actually fires the request.
      supabase
        .from("practice_settings")
        .update({ hidden_chart_series: next })
        .eq("admin_id", userProfile.id)
        .then(({ error }) => {
          if (error) console.error("Failed to save chart visibility:", error.message);
        });
    }
  };

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
  );

  // Not useFetchOnIdle: state.sessions is shared with the client detail page,
  // which loads just one client's rows and still marks status "succeeded".
  // Refetch whenever what's loaded isn't the whole practice; `scope === "all"`
  // then stops the loop.
  useEffect(() => {
    if (sessionsStatus !== "loading" && sessionsScope !== "all") {
      dispatch(fetchAllSessions());
    }
  }, [dispatch, sessionsScope, sessionsStatus]);

  useFetchOnIdle(
    (state: RootState) => state.clientStubs.status,
    () => fetchClientStubs(),
    "Failed to fetch offline clients",
  );

  useRealtimeTable("sessions", "duration_minutes=gte.0", () => dispatch(fetchAllSessions()));

  useEffect(() => {
    supabase
      .from("stub_sessions")
      .select("id, stub_id, scheduled_at, duration_minutes, status, location, amount_paid, paid, price_pence")
      .neq("status", "cancelled")
      .then(({ data }) => data && setStubSessions(data));
    supabase
      .from("payments")
      .select("paid_at, amount_pence")
      .then(({ data }) => data && setManualPayments(data));
    supabase
      .from("expenses")
      .select("incurred_on, amount_pence")
      .then(({ data }) => data && setExpenses(data));
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("reschedule_requests").select("id, client_id, requested_at, created_at").eq("status", "pending"),
      supabase.from("cancellation_requests").select("id, client_id, created_at").eq("status", "pending"),
    ]).then(([reschedule, cancellation]) => {
      const combined: PendingRequest[] = [
        ...(reschedule.data ?? []).map((r) => ({ kind: "reschedule" as const, ...r })),
        ...(cancellation.data ?? []).map((c) => ({ kind: "cancellation" as const, ...c })),
      ];
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPendingRequests(combined.slice(0, 4));
    });
  }, []);

  // Granularity + range for the combined Practice trends chart — defaults to
  // weekly (matching the old "Sessions per week" card it's replacing).
  const trend = useTrendControls("week");

  const revenueTrendData = useMemo(() => {
    const revenueRows = [
      ...paidSessionRows(allSessions),
      ...paidStubSessionRows(stubSessions),
      ...paidPaymentRows(manualPayments),
    ];
    const outgoingsRows = expenses.map((e) => ({ date: e.incurred_on, pence: e.amount_pence }));

    const revenue = bucketTrend(revenueRows, trend);
    const outgoings = bucketTrend(outgoingsRows, trend);

    return revenue.map((r, i) => ({
      label: r.label,
      Revenue: r.value,
      Outgoings: outgoings[i]?.value ?? 0,
    }));
  }, [allSessions, stubSessions, manualPayments, expenses, trend]);

  const sessionsTrendData = useMemo(() => {
    const sessionRows = allSessions.filter((s) => s.status !== "cancelled").map((s) => ({ date: s.scheduled_at }));
    return bucketCount(sessionRows, trend);
  }, [allSessions, trend]);

  const visibleRevenueSeries = useMemo(
    () => REVENUE_SERIES.filter((s) => !hiddenTrendKeys.has(s.key)),
    [hiddenTrendKeys],
  );

  const unpaidSessions = useMemo(
    () =>
      allSessions
        .filter((s) => !s.paid && s.status !== "cancelled" && dayjs(s.scheduled_at).isBefore(dayjs()))
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 5),
    [allSessions],
  );

  // Bank transfers a client has self-marked as paid — the admin still has to
  // confirm each in the Income ledger. Grouped by client for the dashboard's
  // "Needs attention" block.
  const pendingBankTransfers = useMemo(() => {
    const byClient = new Map<string, { clientId: string | null; count: number; pence: number }>();
    for (const s of allSessions) {
      if (s.manual_payment_status !== "pending" || s.status === "cancelled") continue;
      const key = s.client_id ?? "none";
      const prev = byClient.get(key) ?? { clientId: s.client_id, count: 0, pence: 0 };
      prev.count += 1;
      prev.pence += s.price_pence ?? 0;
      byClient.set(key, prev);
    }
    return [...byClient.values()];
  }, [allSessions]);

  const guard = isPageStatusLoading(usersStatus, sessionsStatus);
  if (guard) return guard;

  const getClientName = (clientId: string | null): string => {
    if (!clientId) return "Unknown";
    const c = allClients.find((x) => x.id === clientId);
    return c ? clientDisplayName(c, useCodenames) : "Unknown";
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header} id="dash-header">
          <div>
            <h1>Welcome, {userProfile?.first_name}</h1>
            <p>Here's how your practice is doing</p>
          </div>
          <Card className={styles.quickActionsCard} id="dash-quick-actions">
            <p className={styles.quickActionsLabel}>Quick actions</p>
            <div className={styles.quickActionsRow}>
              <Link to="/admin/scheduler?newSession=1" title="New client session">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <CreateSession />
                </div>
              </Link>

              <Link to="/admin/clients?new=true" title="Invite client to platform">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <MailIcon />
                </div>
              </Link>

              <Link to="/admin/forms?new=true" title="New form">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <FormsIcon />
                </div>
              </Link>

              <Link to="/admin/scheduler?availability=1" title="Manage availability">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <RescheduleIcon />
                </div>
              </Link>

              <Link to="/admin/finances?view=income&new=true" title="Record a payment">
                <div className={`${styles.metricIcon} ${styles.sky}`}>
                  <MoneyIcon />
                </div>
              </Link>

              <button
                type="button"
                className={styles.quickActionBtn}
                onClick={() => setAnnounceOpen(true)}
                title="Send an announcement to clients"
              >
                <div className={`${styles.metricIcon} ${styles.sky} ${styles.announce}`}>
                  <MegaphoneIcon />
                </div>
              </button>
            </div>
          </Card>
        </div>

        {announceOpen && (
          <SendAnnouncementModal
            clients={allClients}
            useCodenames={useCodenames}
            onClose={() => setAnnounceOpen(false)}
          />
        )}

        {/* ── Primary two-column grid: Upcoming + Recent ── */}
        <div className={styles.primaryGrid}>
          <Card className={styles.sectionCard}>
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
                stubSessions={stubSessions}
                stubs={allStubs}
                useCodenames={practiceSettings?.use_client_codenames ?? false}
                limit={5}
              />
            </CollapsibleSection>
          </Card>

          {(pendingRequests.length > 0 || pendingBankTransfers.length > 0) && (
            <Card className={styles.sectionCard}>
              <CollapsibleSection
                title="Needs attention"
                storageKey="dash:attention"
                forceOpen
                headerRight={
                  <>
                    <NotificationBadge number={pendingRequests.length + pendingBankTransfers.length} />
                    <Link to="/admin/clients" className={styles.sectionLink}>
                      View all →
                    </Link>
                  </>
                }
              >
                <div className={styles.recentList}>
                  {pendingBankTransfers.map((bt) => {
                    const name = getClientName(bt.clientId);
                    const label =
                      bt.count > 1
                        ? `Marked ${bt.count} bank transfers as paid — confirm them`
                        : "Marked a bank transfer as paid — confirm it";
                    return (
                      <Link
                        key={`bt-${bt.clientId ?? "none"}`}
                        to="/admin/finances?view=income"
                        className={styles.recentRowLink}
                      >
                        <div className={styles.recentRow}>
                          <Avatar name={name} color={pickColor(bt.clientId ?? "")} size={32} />
                          <div className={styles.recentInfo}>
                            <p className={styles.recentName}>{name}</p>
                            <p className={styles.recentMeta}>
                              {label} · £{(bt.pence / 100).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  {pendingRequests.map((r) => {
                    const name = getClientName(r.client_id);
                    const label =
                      r.kind === "reschedule"
                        ? `Wants to reschedule to ${dayjs(r.requested_at).format("D MMM [at] h:mma")}`
                        : "Requested to cancel their session";
                    return (
                      <Link
                        key={`${r.kind}-${r.id}`}
                        to={`/admin/clients/${r.client_id}`}
                        className={styles.recentRowLink}
                      >
                        <div className={styles.recentRow}>
                          <Avatar name={name} color={pickColor(r.client_id)} size={32} />
                          <div className={styles.recentInfo}>
                            <p className={styles.recentName}>{name}</p>
                            <p className={styles.recentMeta}>
                              {label} · {timeAgo(r.created_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CollapsibleSection>
            </Card>
          )}
        </div>

        {/* ── Outstanding payments ── */}
        <Card className={styles.sectionCard}>
          <CollapsibleSection
            title={`Outstanding payments${unpaidSessions.length > 0 ? ` (${unpaidSessions.length})` : ""}`}
            storageKey="dash:invoices"
            headerRight={
              unpaidSessions.length > 0 ? (
                <Link to="/admin/finances?view=income" className={styles.sectionLink}>
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
                    <Link key={s.id} to="/admin/finances?view=income" className={styles.invoiceRowLink}>
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
        </Card>

        <Card className={styles.sectionCard}>
          <CollapsibleSection title="Practice trends" storageKey="dash:trends">
            <HideableSection id="dashboard-practice-trends">
              <TrendControls state={trend} hideChartType />
              <SeriesToggleChips series={REVENUE_SERIES} hidden={hiddenTrendKeys} onToggle={toggleTrendSeries} />
              <div className={styles.trendsRow}>
                <TrendChart
                  title="Sessions"
                  data={sessionsTrendData}
                  type="bar"
                  color="#3a7fa8"
                  valueFormatter={(v) => `${v}`}
                />
                <TrendChart
                  title="Revenue & outgoings"
                  data={revenueTrendData}
                  series={visibleRevenueSeries}
                  valueFormatter={(v) => `£${v.toFixed(2)}`}
                  leftAxisLabel="£"
                />
              </div>
            </HideableSection>
          </CollapsibleSection>
        </Card>

        <HideableSection id="dashboard-todos">
          <Card className={styles.sectionCard}>
            <CollapsibleSection title="To-dos" storageKey="dash:todos">
              <TodoListCard embedded />
            </CollapsibleSection>
          </Card>
        </HideableSection>
      </div>
    </div>
  );
}
