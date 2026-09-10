import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import DonutChart from "@components/shared/DonutChart/DonutChart";
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

// The three overlaid measures on the Overview trend card. `Owed` is money
// invoiced or billed to a past session that hasn't landed yet — always a
// dashed line, whichever way the bar/line toggle is set.
const OVERVIEW_SERIES: TrendSeries[] = [
  { key: "Income", name: "Income", color: "#4a665b" },
  { key: "Outgoings", name: "Outgoings", color: "#a8633a" },
  { key: "Owed", name: "Owed / overdue", color: "#8a6a2d", kind: "line", dashed: true },
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
  const { userProfile, practiceSettings } = useAuth();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const invoicesEnabled = practiceSettings?.invoices_enabled !== false;
  const [period, setPeriod] = useState<Period>("30d");
  const trend = useTrendControls("month");
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
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

  const toggleSeries = (key: string) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
      <div className={styles.periodRow}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.periodBtn} ${period === p.key ? styles.periodBtnActive : ""}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={styles.tiles}>
        <StatTile label="Income" value={money(incomePence)} sub="Payments received" />
        <StatTile label="Outgoings" value={money(outgoingsPence)} sub="Expenses recorded" />
        <StatTile
          label="Net"
          value={money(netPence)}
          sub="Income minus outgoings"
          tone={netPence < 0 ? "danger" : "default"}
        />
      </div>

      <TrendControls state={trend} />

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

      <div className={styles.chartsRow}>
        <DonutChart
          title="Income vs outgoings"
          slices={[
            { name: "Income", value: incomePence / 100, color: "#4a665b" },
            { name: "Outgoings", value: outgoingsPence / 100, color: "#a8633a" },
          ]}
          centerValue={money(netPence)}
          centerLabel="net"
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

        <nav className={styles.tabs} aria-label="Finances views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`${styles.tab} ${view === v.key ? styles.tabActive : ""}`}
              aria-current={view === v.key ? "page" : undefined}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>

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
