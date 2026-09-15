import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import DonutChart from "@components/shared/DonutChart/DonutChart";
import SettingsTabs from "@components/shared/SettingsTabs/SettingsTabs";
import Spinner from "@components/shared/Spinner/Spinner";
import StatTile from "@components/shared/StatTile/StatTile";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/models/database.types";
import TrendChart, { type TrendSeries } from "@/pages/admin/AdminDashboard/Blocks/TrendChart/TrendChart";
import {
  bucketTrend,
  ledgerRowKind,
  ledgerRowName,
  money,
  type Period,
  periodStart,
  presetRangeForPeriod,
  zipTrends,
} from "./financeOverview";
import TrendControls from "./TrendControls";
import { useTrendControls } from "./useTrendControls";

import styles from "./AdminFinancesPage.module.scss";

const AdminPaymentsPage = lazy(() => import("../AdminPaymentsPage/AdminPaymentsPage"));
const AdminInvoicesPage = lazy(() => import("../AdminInvoicesPage/AdminInvoicesPage"));
const AdminExpensesPage = lazy(() => import("../AdminExpensesPage/AdminExpensesPage"));

type View = "overview" | "income" | "invoices" | "expenses";

const ALL_VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "year", label: "This tax year" },
  { key: "all", label: "All time" },
];

// The three overlaid measures on the Overview trend card, all following the
// bar/line toggle together (no series pinned to one mode) — in bar mode
// TrendChart overlaps same-axis bars with reduced opacity rather than
// grouping them side by side, so all three stay readable as bars too.
// `Owed` keeps a dashed stroke when it renders as a line — money invoiced or
// billed to a past session that hasn't landed yet reads naturally as
// "provisional", vs. Income/Outgoings' settled solid lines.
const OVERVIEW_SERIES: TrendSeries[] = [
  { key: "Income", name: "Income", color: "var(--accent)" },
  { key: "Outgoings", name: "Outgoings", color: "#a8633a" },
  // A distinct blue, not another orange/brown — Outgoings already owns that
  // band and sat too close to Owed's old olive tone to tell apart at a glance.
  { key: "Owed", name: "Owed / overdue", color: "#3a7fa8", dashed: true },
];

type LedgerRow = Database["public"]["Views"]["payment_ledger_rows"]["Row"];

type ExpenseRow = {
  id: string;
  incurred_on: string;
  category: string;
  amount_pence: number;
  description: string | null;
};

type ActivityItem = {
  id: string;
  date: string;
  title: string;
  detail: string;
  amount: number;
  kind: "in" | "out";
};

function Overview({ onJump }: { onJump: (v: View, openNew: boolean) => void }) {
  const { userProfile, practiceSettings, isDemo, updatePracticeSettingsLocal } = useAuth();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const invoicesEnabled = practiceSettings?.invoices_enabled !== false;
  const [period, setPeriod] = useState<Period>("30d");
  const trend = useTrendControls("month");
  const { setUnit: setTrendUnit, setFrom: setTrendFrom, setTo: setTrendTo } = trend;

  // The quick-select period pills used to only scope the stat tiles while a
  // separate date-range picker scoped the chart — two range controls that
  // looked related but could disagree. Picking a period now also moves the
  // chart's range to match; the pickers stay for fine-tuning the chart alone.
  const selectPeriod = useCallback(
    (p: Period) => {
      setPeriod(p);
      const preset = presetRangeForPeriod(p);
      setTrendUnit(preset.unit);
      setTrendFrom(preset.from);
      setTrendTo(preset.to);
    },
    [setTrendUnit, setTrendFrom, setTrendTo],
  );
  // Persisted to practice_settings (see AdminDashboard's Practice Trends
  // widget for the matching "practiceTrends" key on the same jsonb column)
  // instead of plain component state, so it survives a reload.
  const hiddenSeries = useMemo(
    () => new Set(practiceSettings?.hidden_chart_series?.financeOverview ?? []),
    [practiceSettings?.hidden_chart_series],
  );
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [openInvoices, setOpenInvoices] = useState<{ due: string; pence: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userProfile?.id) return;
    const [{ data: l }, { data: exp }, { data: inv }] = await Promise.all([
      supabase.from("payment_ledger_rows").select("*"),
      supabase
        .from("expenses")
        .select("id, incurred_on, category, amount_pence, description")
        .eq("admin_id", userProfile.id),
      invoicesEnabled
        ? supabase
            .from("invoices")
            .select("due_date, issue_date, total_pence, status")
            .eq("admin_id", userProfile.id)
            .in("status", ["draft", "sent"])
        : Promise.resolve({ data: [] as { due_date: string | null; issue_date: string; total_pence: number }[] }),
    ]);
    setLedger((l as LedgerRow[]) ?? []);
    setExpenses((exp as ExpenseRow[]) ?? []);
    setOpenInvoices(
      ((inv as { due_date: string | null; issue_date: string; total_pence: number }[]) ?? []).map((i) => ({
        due: i.due_date ?? i.issue_date,
        pence: i.total_pence,
      })),
    );
    setLoading(false);
  }, [userProfile?.id, invoicesEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = periodStart(period);
  const inPeriod = (iso: string | null | undefined) => !start || (iso ? dayjs(iso).isAfter(start) : false);

  const incomePence = ledger
    .filter((r) => r.is_paid && inPeriod(r.date))
    .reduce((s, r) => s + (r.amount_pence ?? 0), 0);
  const outgoingsPence = expenses.filter((e) => inPeriod(e.incurred_on)).reduce((s, e) => s + e.amount_pence, 0);
  const netPence = incomePence - outgoingsPence;

  const combined = useMemo(() => {
    const income = bucketTrend(
      ledger.filter((r) => r.is_paid && r.date).map((r) => ({ date: r.date as string, pence: r.amount_pence ?? 0 })),
      trend,
    );
    const outgoings = bucketTrend(
      expenses.map((e) => ({ date: e.incurred_on, pence: e.amount_pence })),
      trend,
    );
    // Owed = unpaid ledger rows (a session/stub session not yet settled) plus
    // any open invoice, bucketed by when the money is/was due.
    const owed = bucketTrend(
      [
        ...ledger
          .filter((r) => !r.is_paid && r.date)
          .map((r) => ({ date: r.date as string, pence: r.amount_pence ?? 0 })),
        ...openInvoices.map((i) => ({ date: i.due, pence: i.pence })),
      ],
      trend,
    );
    return zipTrends({ Income: income, Outgoings: outgoings, Owed: owed });
  }, [ledger, expenses, openInvoices, trend]);

  const visibleSeries = useMemo(() => OVERVIEW_SERIES.filter((s) => !hiddenSeries.has(s.key)), [hiddenSeries]);

  // "Series shown" only ever touched the trend chart below — the stat tiles
  // and the donut kept showing Income/Outgoings/Net regardless, so hiding a
  // series there looked like it did nothing everywhere else on the page.
  // Tying them to the same toggle: a tile disappears with its own series,
  // and Net (income minus outgoings) only means anything with both present.
  const incomeHidden = hiddenSeries.has("Income");
  const outgoingsHidden = hiddenSeries.has("Outgoings");
  const netHidden = incomeHidden || outgoingsHidden;
  // With only one side of the ratio left to show, the donut's centre falls
  // back to that side's own total instead of a "net" figure that would
  // silently still include the hidden one.
  const donutSoloPence = incomeHidden ? -outgoingsPence : incomePence;
  const donutSoloLabel = incomeHidden ? "outgoings" : "income";

  const toggleSeries = (key: string) => {
    const currentForChart = new Set(hiddenSeries);
    if (currentForChart.has(key)) currentForChart.delete(key);
    else currentForChart.add(key);
    const next = { ...practiceSettings?.hidden_chart_series, financeOverview: Array.from(currentForChart) };
    updatePracticeSettingsLocal({ hidden_chart_series: next });
    if (!isDemo && userProfile?.id) {
      // Postgrest's query builder is a lazy thenable — building it never
      // sends anything; only calling .then() (or awaiting it) actually
      // fires the request. See the matching comment on AdminDashboard's
      // toggleTrendSeries, which had the exact same silent no-op bug.
      supabase
        .from("practice_settings")
        .update({ hidden_chart_series: next })
        .eq("admin_id", userProfile.id)
        .then(({ error }) => {
          if (error) console.error("Failed to save chart visibility:", error.message);
        });
    }
  };

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [
      ...ledger
        .filter((r) => r.is_paid && r.date)
        .map((r, i) => {
          const who = ledgerRowName(r, useCodenames);
          return {
            id: `l${i}`,
            date: r.date as string,
            title: who ? `Payment from ${who}` : "Payment received",
            detail: r.description?.trim() || ledgerRowKind(r.source),
            amount: r.amount_pence ?? 0,
            kind: "in" as const,
          };
        }),
      ...expenses.map((e) => ({
        id: `e${e.id}`,
        date: e.incurred_on,
        title: e.category || "Expense",
        detail: e.description?.trim() || "Expense",
        amount: e.amount_pence,
        kind: "out" as const,
      })),
    ];
    return items.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()).slice(0, 10);
  }, [ledger, expenses, useCodenames]);

  if (loading) return null;

  return (
    <div className={styles.overview}>
      <Card className={styles.controlsBar}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Range presets</span>
          <div className={styles.periodRow}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`${styles.periodBtn} ${period === p.key ? styles.periodBtnActive : ""}`}
                onClick={() => selectPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <TrendControls state={trend} />

        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Series shown</span>
          <div className={styles.seriesToggle}>
            {OVERVIEW_SERIES.map((s) => {
              const on = !hiddenSeries.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`${styles.seriesChip} ${on ? "" : styles.seriesChipOff}`}
                  aria-pressed={on}
                  onClick={() => toggleSeries(s.key)}
                >
                  <span className={styles.seriesDot} style={{ background: s.color }} />
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className={styles.tiles}>
        {!incomeHidden && <StatTile label="Income" value={money(incomePence)} sub="Payments received" />}
        {!outgoingsHidden && <StatTile label="Outgoings" value={money(outgoingsPence)} sub="Expenses recorded" />}
        {!netHidden && (
          <StatTile
            label="Net"
            value={money(netPence)}
            sub="Income minus outgoings"
            tone={netPence < 0 ? "danger" : "default"}
          />
        )}
      </div>

      <div className={styles.chartsRow}>
        <DonutChart
          title="Income vs outgoings"
          slices={[
            ...(incomeHidden ? [] : [{ name: "Income", value: incomePence / 100, color: "var(--accent)" }]),
            ...(outgoingsHidden ? [] : [{ name: "Outgoings", value: outgoingsPence / 100, color: "#a8633a" }]),
          ]}
          centerValue={money(netHidden ? donutSoloPence : netPence)}
          centerLabel={netHidden ? donutSoloLabel : "net"}
        />
        <TrendChart
          title="Income & outgoings"
          data={combined}
          type={trend.chartType}
          series={visibleSeries}
          valueFormatter={(v) => `£${v}`}
          height={240}
        />
      </div>

      <Card className={styles.activityCard}>
        <div className={styles.activityHead}>
          <h2>Recent activity</h2>
          <div className={styles.activityActions}>
            <Button size="sm" variant="secondary" onClick={() => onJump("income", true)}>
              Record payment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onJump("expenses", true)}>
              Add expense
            </Button>
          </div>
        </div>
        {activity.length === 0 ? (
          <p className={styles.empty}>Nothing recorded yet.</p>
        ) : (
          <ul className={styles.activityList}>
            {activity.map((a) => (
              <li key={a.id} className={styles.activityRow}>
                <span className={styles.activityDate}>{dayjs(a.date).format("D MMM")}</span>
                <span className={styles.activityText}>
                  <span className={styles.activityTitle}>{a.title}</span>
                  <span className={styles.activityDetail}>{a.detail}</span>
                </span>
                <span className={`${styles.activityAmount} ${a.kind === "out" ? styles.negative : styles.positive}`}>
                  {a.kind === "out" ? "−" : "+"}
                  {money(a.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function AdminFinancesPage() {
  const { practiceSettings } = useAuth();
  const invoicesEnabled = practiceSettings?.invoices_enabled !== false;
  const VIEWS = invoicesEnabled ? ALL_VIEWS : ALL_VIEWS.filter((v) => v.key !== "invoices");

  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  let view: View = rawView === "income" || rawView === "invoices" || rawView === "expenses" ? rawView : "overview";
  if (view === "invoices" && !invoicesEnabled) view = "overview";
  const [openNewFor, setOpenNewFor] = useState<View | null>(null);

  const setView = (v: View) => {
    setSearchParams(
      (p) => {
        if (v === "overview") p.delete("view");
        else p.set("view", v);
        return p;
      },
      { replace: true },
    );
  };

  const jump = (v: View, openNew: boolean) => {
    setOpenNewFor(openNew ? v : null);
    setView(v);
  };

  // Clear the one-shot "open modal" intent once we've left that view.
  useEffect(() => {
    if (openNewFor && openNewFor !== view) setOpenNewFor(null);
  }, [view, openNewFor]);

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header}>
          <h1 className={styles.title}>Finances</h1>
        </div>

        <SettingsTabs
          tabs={VIEWS.map((v) => ({ id: v.key, label: v.label }))}
          value={view}
          onChange={setView}
          ariaLabel="Finances views"
          idBase="admin-finances"
          syncSearchParam={false}
        />

        <Suspense fallback={<Spinner />}>
          {view === "overview" && <Overview onJump={jump} />}
          {view === "income" && <AdminPaymentsPage embedded openNew={openNewFor === "income"} />}
          {view === "invoices" && <AdminInvoicesPage embedded openNew={openNewFor === "invoices"} />}
          {view === "expenses" && <AdminExpensesPage embedded openNew={openNewFor === "expenses"} />}
        </Suspense>
      </div>
    </div>
  );
}
