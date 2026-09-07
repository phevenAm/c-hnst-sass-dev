import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { fetchAgencyMembers, selectAgencyMembers, selectIsAgencyManager } from "@store/slices/agencySlice";

import { type ActivityExportRow, exportActivityCsv, exportActivityPdf } from "@/Helpers/activityLogExport";
import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

// ── Types ──────────────────────────────────────────────────
type FeedRow = {
  source: "member" | "agency";
  event_time: string;
  actor_id: string | null;
  actor_name: string | null;
  category: string;
  summary: string;
  detail: Record<string, unknown> | null;
};

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
] as const;

// ── Helpers ────────────────────────────────────────────────
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  const time = m > 0 ? `${h}:${m.toString().padStart(2, "0")}${ampm}` : `${h}${ampm}`;
  return `${time}, ${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

// Ignore plumbing columns when summarising a member row's field changes.
const NOISE = new Set(["id", "created_at", "updated_at", "admin_id", "created_by", "_seed"]);

function memberChangeDetail(detail: FeedRow["detail"]): string {
  if (!detail || detail.action !== "UPDATE") return "";
  const before = (detail.old ?? {}) as Record<string, unknown>;
  const after = (detail.new ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const key of Object.keys(after)) {
    if (NOISE.has(key) || key.endsWith("_at") || key.endsWith("_id")) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    out.push(`${key.replace(/_/g, " ")}: ${fmtVal(before[key])} → ${fmtVal(after[key])}`);
    if (out.length === 4) break;
  }
  return out.join("; ");
}

function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function agencyMetaDetail(detail: FeedRow["detail"]): string {
  if (!detail) return "";
  return Object.entries(detail)
    .filter(([k, v]) => !NOISE.has(k) && v != null && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${fmtVal(v)}`)
    .join("; ");
}

const rowDetail = (r: FeedRow): string =>
  r.source === "member" ? memberChangeDetail(r.detail) : agencyMetaDetail(r.detail);

// ── Page ───────────────────────────────────────────────────
export default function AgencyActivityPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const members = useAppSelector(selectAgencyMembers);

  const [rows, setRows] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [member, setMember] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [exportingPdf, setExportingPdf] = useState(false);

  const activeMembers = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id, m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Staff");
    }
    return map;
  }, [members]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const since = rangeDays > 0 ? new Date(Date.now() - rangeDays * 86_400_000).toISOString() : null;
    const { data, error: rpcErr } = await supabase.rpc("agency_activity_feed", {
      p_member: member === "all" ? null : member,
      p_since: since,
      p_limit: 500,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setRows([]);
    } else {
      setRows((data ?? []) as FeedRow[]);
    }
    setLoading(false);
  }, [member, rangeDays]);

  useEffect(() => {
    if (isManager) dispatch(fetchAgencyMembers());
  }, [dispatch, isManager]);

  useEffect(() => {
    if (isManager) load();
  }, [isManager, load]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, FeedRow[]>();
    for (const r of rows) byDay.set(dayKey(r.event_time), [...(byDay.get(dayKey(r.event_time)) ?? []), r]);
    return [...byDay.entries()];
  }, [rows]);

  const toExportRows = (): ActivityExportRow[] =>
    rows.map((r) => ({
      when: formatWhen(r.event_time),
      who: r.actor_name || (r.actor_id ? (memberName.get(r.actor_id) ?? "Someone") : "Agency"),
      summary: r.summary,
      details: rowDetail(r),
    }));

  const scopeLabel = member === "all" ? "All staff" : `${memberName.get(member) ?? "One member"} only`;
  const stamp = new Date().toISOString().slice(0, 10);

  const handleCsv = () =>
    exportActivityCsv(toExportRows(), {
      filename: `agency-activity-${stamp}`,
      title: "Agency activity log",
      meta: [
        ["Scope", scopeLabel],
        ["Range", RANGES.find((r) => r.days === rangeDays)?.label ?? "—"],
        ["Entries", rows.length],
      ],
    });

  const handlePdf = async () => {
    setExportingPdf(true);
    try {
      await exportActivityPdf(toExportRows(), {
        filename: `agency-activity-${stamp}`,
        title: "Agency activity log",
        subtitle: `${scopeLabel} · ${RANGES.find((r) => r.days === rangeDays)?.label ?? ""}`,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Activity</h1>
          <p className={styles.subtitle}>
            Every staff member's actions plus agency events — invites, agreements, client assignments, invoices.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={handleCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePdf} disabled={rows.length === 0 || exportingPdf}>
            {exportingPdf ? "Preparing…" : "Export PDF"}
          </Button>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className={styles.filterRow}>
        <select
          className={styles.select}
          value={member}
          onChange={(e) => setMember(e.target.value)}
          aria-label="Filter by staff member"
        >
          <option value="all">All staff members</option>
          {activeMembers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {memberName.get(m.user_id)}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <option key={r.label} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p className={styles.empty}>Loading activity…</p>}
      {!loading && rows.length === 0 && !error && <p className={styles.empty}>No activity in this range.</p>}

      {grouped.map(([day, dayRows]) => (
        <div key={day} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{day}</h2>
            <span className={styles.countPill}>{dayRows.length}</span>
          </div>
          <div className={styles.list}>
            {dayRows.map((r, i) => {
              const detail = rowDetail(r);
              return (
                <div key={`${r.event_time}-${i}`} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>{r.summary}</span>
                    <span className={styles.rowMeta}>
                      {(r.actor_name || "Agency") +
                        " · " +
                        new Date(r.event_time).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      {detail ? ` · ${detail}` : ""}
                    </span>
                  </div>
                  <span className={styles.pill}>
                    {r.source === "agency" ? "Agency" : r.category.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
