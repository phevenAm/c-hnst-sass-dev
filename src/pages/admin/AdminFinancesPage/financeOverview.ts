import dayjs, { type Dayjs } from "dayjs";

import type { TrendPoint } from "@/pages/admin/AdminDashboard/dashboardUtils";

export type Period = "30d" | "year" | "all";

export type NamePart = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
};

/** The name-bearing fields of a `payment_ledger_rows` row. */
export type LedgerName = {
  display_name?: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  stub_first_name?: string | null;
  stub_last_name?: string | null;
};

export const money = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

/** Start of the UK tax year (6 April) for the tax year that `d` falls in. */
export const taxYearStart = (d: Dayjs = dayjs()): Dayjs => {
  const before6Apr = d.month() < 3 || (d.month() === 3 && d.date() < 6);
  return dayjs(`${before6Apr ? d.year() - 1 : d.year()}-04-06`);
};

/** The cut-off a period filters from, or null for "all time". */
export const periodStart = (period: Period): Dayjs | null => {
  if (period === "30d") return dayjs().subtract(30, "day");
  if (period === "year") return taxYearStart();
  return null;
};

/** Bucket dated + priced (pence) rows into the last `months` calendar months. */
export const byMonth = (rows: { date: string; pence: number }[], months: number): TrendPoint[] => {
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

/** display_name → "First Last" → "" (an embedded users/stubs row). */
export const personName = (n: NamePart | null | undefined): string =>
  (n?.display_name || [n?.first_name, n?.last_name].filter(Boolean).join(" ") || "").trim();

/** Best name for a ledger row: its own display_name, else client, else stub. */
export const ledgerRowName = (r: LedgerName): string =>
  (
    r.display_name ||
    [r.client_first_name, r.client_last_name].filter(Boolean).join(" ") ||
    [r.stub_first_name, r.stub_last_name].filter(Boolean).join(" ") ||
    ""
  ).trim();

/** Human label for a ledger row's `source`. */
export const ledgerRowKind = (source: string | null): string => {
  if (source === "session") return "Session payment";
  if (source === "stub-session") return "Offline session payment";
  return "Manual payment";
};
