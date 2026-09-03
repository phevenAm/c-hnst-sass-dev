import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs, { type Dayjs } from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import DonutChart from "@components/shared/DonutChart/DonutChart";
import Spinner from "@components/shared/Spinner/Spinner";
import StatTile from "@components/shared/StatTile/StatTile";
import { useAuth } from "@context/AuthContext";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/models/database.types";
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

type LedgerRow = Database["public"]["Views"]["payment_ledger_rows"]["Row"];

type NamePart = { first_name: string | null; last_name: string | null; display_name?: string | null };
type InvoiceRow = {
  id: string;
  reference: string;
  status: string;
  total_pence: number;
  issue_date: string;
  paid_at: string | null;
  client: NamePart | null;
  stub: NamePart | null;
};
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

const personName = (n: NamePart | null | undefined): string =>
  (n?.display_name || [n?.first_name, n?.last_name].filter(Boolean).join(" ") || "").trim();

const ledgerRowName = (r: LedgerRow): string =>
  (
    r.display_name ||
    [r.client_first_name, r.client_last_name].filter(Boolean).join(" ") ||
    [r.stub_first_name, r.stub_last_name].filter(Boolean).join(" ") ||
    ""
  ).trim();

const ledgerRowKind = (source: string | null): string => {
  if (source === "session") return "Session payment";
  if (source === "stub-session") return "Offline session payment";
  return "Manual payment";
};

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
      supabase.from("payment_ledger_rows").select("*"),
      supabase
        .from("invoices")
        .select(
          "id, reference, status, total_pence, issue_date, paid_at, client:client_id(first_name,last_name,display_name), stub:stub_id(first_name,last_name)",
        )
        .eq("admin_id", userProfile.id),
      supabase
        .from("expenses")
        .select("id, incurred_on, category, amount_pence, description")
        .eq("admin_id", userProfile.id),
    ]);
    setLedger((l as LedgerRow[]) ?? []);
    setInvoices((inv as unknown as InvoiceRow[]) ?? []);
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
        .map((r, i) => {
          const who = ledgerRowName(r);
          return {
            id: `l${i}`,
            date: r.date as string,
            title: who ? `Payment from ${who}` : "Payment received",
            detail: r.description?.trim() || ledgerRowKind(r.source),
            amount: r.amount_pence ?? 0,
            kind: "in" as const,
          };
        }),
      ...invoices.map((inv) => {
        const who = personName(inv.client) || personName(inv.stub);
        const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
        return {
          id: `i${inv.id}`,
          date: inv.paid_at ?? inv.issue_date,
          title: `Invoice ${inv.reference}`,
          detail: who ? `${statusLabel} · ${who}` : statusLabel,
          amount: inv.total_pence,
          kind: inv.status === "paid" ? ("in" as const) : ("out" as const),
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
        <StatTile label="Income" value={money(incomePence)} />
        <StatTile label="Outgoings" value={money(outgoingsPence)} />
        <StatTile label="Outstanding" value={money(outstandingPence)} onClick={() => onJump("invoices", false)} />
        <StatTile label="Net" value={money(netPence)} tone={netPence < 0 ? "danger" : "default"} />
      </div>

      <div className={styles.charts}>
        <DonutChart
          title="Income vs outgoings"
          slices={[
            { name: "Income", value: incomePence / 100, color: "#4a665b" },
            { name: "Outgoings", value: outgoingsPence / 100, color: "#a8633a" },
          ]}
          centerValue={money(netPence)}
          centerLabel="net"
        />
        <TrendChart title="Income — last 6 months" data={incomeTrend} type="bar" valueFormatter={(v) => `£${v}`} />
        <TrendChart
          title="Outgoings — last 6 months"
          data={outgoingsTrend}
          type="bar"
          color="#a8633a"
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
