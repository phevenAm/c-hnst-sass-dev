import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs, { type Dayjs } from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import Spinner from "@components/shared/Spinner/Spinner";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";
import TrendChart from "@/pages/admin/AdminDashboard/Blocks/TrendChart/TrendChart";
import type { TrendPoint } from "@/pages/admin/AdminDashboard/dashboardUtils";

import styles from "./AdminFinancesPage.module.scss";

const AdminPaymentsPage = lazy(() => import("../AdminPaymentsPage/AdminPaymentsPage"));
const AdminInvoicesPage = lazy(() => import("../AdminInvoicesPage/AdminInvoicesPage"));
const AdminExpensesPage = lazy(() => import("../AdminExpensesPage/AdminExpensesPage"));

type View = "overview" | "income" | "invoices" | "expenses";

const VIEWS: { key: View; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "income", label: "Income" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
];

type Period = "30d" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "30d", label: "Last 30 days" },
  { key: "year", label: "This tax year" },
  { key: "all", label: "All time" },
];

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

// UK tax year runs 6 April → 5 April.
const taxYearStart = (d = dayjs()): Dayjs => {
  const before6Apr = d.month() < 3 || (d.month() === 3 && d.date() < 6);
  return dayjs(`${before6Apr ? d.year() - 1 : d.year()}-04-06`);
};

const periodStart = (period: Period): Dayjs | null => {
  if (period === "30d") return dayjs().subtract(30, "day");
  if (period === "year") return taxYearStart();
  return null;
};

// Bucket dated + priced rows into the last `months` calendar months.
const byMonth = (rows: { date: string; pence: number }[], months: number): TrendPoint[] => {
  const buckets: { label: string; key: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = dayjs().subtract(i, "month");
    buckets.push({ label: m.format("MMM"), key: m.format("YYYY-MM"), value: 0 });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const b = index.get(dayjs(r.date).format("YYYY-MM"));
    if (b) b.value += r.pence / 100;
  }
  return buckets.map(({ label, value }) => ({ label, value: Math.round(value) }));
};

type LedgerRow = {
  date: string | null;
  amount_pence: number | null;
  is_paid: boolean | null;
  description: string | null;
};
type InvoiceRow = {
  id: string;
  reference: string;
  status: string;
  total_pence: number;
  issue_date: string;
  paid_at: string | null;
};
type ExpenseRow = { id: string; incurred_on: string; category: string; amount_pence: number };

type ActivityItem = { id: string; date: string; label: string; amount: number; kind: "in" | "out" };

function Overview({ onJump }: { onJump: (v: View, openNew: boolean) => void }) {
  const { userProfile } = useAuth();
  const [period, setPeriod] = useState<Period>("30d");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userProfile?.id) return;
    const [{ data: l }, { data: inv }, { data: exp }] = await Promise.all([
      supabase.from("payment_ledger_rows").select("date, amount_pence, is_paid, description"),
      supabase
        .from("invoices")
        .select("id, reference, status, total_pence, issue_date, paid_at")
        .eq("admin_id", userProfile.id),
      supabase.from("expenses").select("id, incurred_on, category, amount_pence").eq("admin_id", userProfile.id),
    ]);
    setLedger((l as LedgerRow[]) ?? []);
    setInvoices((inv as InvoiceRow[]) ?? []);
    setExpenses((exp as ExpenseRow[]) ?? []);
    setLoading(false);
  }, [userProfile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = periodStart(period);
  const inPeriod = (iso: string | null | undefined) => !start || (iso ? dayjs(iso).isAfter(start) : false);

  const incomePence = ledger
    .filter((r) => r.is_paid && inPeriod(r.date))
    .reduce((s, r) => s + (r.amount_pence ?? 0), 0);
  const outgoingsPence = expenses.filter((e) => inPeriod(e.incurred_on)).reduce((s, e) => s + e.amount_pence, 0);
  const outstandingPence = invoices
    .filter((i) => i.status === "draft" || i.status === "sent")
    .reduce((s, i) => s + i.total_pence, 0);
  const netPence = incomePence - outgoingsPence;

  const incomeTrend = useMemo(
    () =>
      byMonth(
        ledger.filter((r) => r.is_paid && r.date).map((r) => ({ date: r.date as string, pence: r.amount_pence ?? 0 })),
        6,
      ),
    [ledger],
  );
  const outgoingsTrend = useMemo(
    () =>
      byMonth(
        expenses.map((e) => ({ date: e.incurred_on, pence: e.amount_pence })),
        6,
      ),
    [expenses],
  );

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [
      ...ledger
        .filter((r) => r.is_paid && r.date)
        .map((r, i) => ({
          id: `l${i}`,
          date: r.date as string,
          label: r.description || "Payment received",
          amount: r.amount_pence ?? 0,
          kind: "in" as const,
        })),
      ...invoices.map((inv) => ({
        id: `i${inv.id}`,
        date: inv.paid_at ?? inv.issue_date,
        label: `Invoice ${inv.reference} — ${inv.status}`,
        amount: inv.total_pence,
        kind: inv.status === "paid" ? ("in" as const) : ("out" as const),
      })),
      ...expenses.map((e) => ({
        id: `e${e.id}`,
        date: e.incurred_on,
        label: `Expense — ${e.category}`,
        amount: e.amount_pence,
        kind: "out" as const,
      })),
    ];
    return items.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()).slice(0, 8);
  }, [ledger, invoices, expenses]);

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
        <Card className={styles.tile}>
          <p className={styles.tileLabel}>Income</p>
          <p className={styles.tileValue}>{money(incomePence)}</p>
        </Card>
        <Card className={styles.tile}>
          <p className={styles.tileLabel}>Outgoings</p>
          <p className={styles.tileValue}>{money(outgoingsPence)}</p>
        </Card>
        <button type="button" className={styles.tileButton} onClick={() => onJump("invoices", false)}>
          <Card className={styles.tile}>
            <p className={styles.tileLabel}>Outstanding</p>
            <p className={styles.tileValue}>{money(outstandingPence)}</p>
          </Card>
        </button>
        <Card className={styles.tile}>
          <p className={styles.tileLabel}>Net</p>
          <p className={`${styles.tileValue} ${netPence < 0 ? styles.negative : ""}`}>{money(netPence)}</p>
        </Card>
      </div>

      <div className={styles.trends}>
        <TrendChart title="Income — last 6 months" data={incomeTrend} type="bar" valueFormatter={(v) => `£${v}`} />
        <TrendChart
          title="Outgoings — last 6 months"
          data={outgoingsTrend}
          type="bar"
          color="var(--danger)"
          valueFormatter={(v) => `£${v}`}
        />
      </div>

      <Card className={styles.activityCard}>
        <div className={styles.activityHead}>
          <h2>Recent activity</h2>
          <div className={styles.activityActions}>
            <Button size="sm" variant="secondary" onClick={() => onJump("invoices", true)}>
              New invoice
            </Button>
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
                <span className={styles.activityLabel}>{a.label}</span>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("view") as View) || "overview";
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
