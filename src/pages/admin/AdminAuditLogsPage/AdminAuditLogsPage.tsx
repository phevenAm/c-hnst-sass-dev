import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import type { AuditLog } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import {
  fetchAuditLogs,
  resetAuditLogs,
  selectAllAuditLogs,
  selectAuditLogsStatus,
} from "@store/slices/auditLogsSlice";

import { isPageStatusLoading } from "@/Helpers/Helpers";

import styles from "./AdminAuditLogsPage.module.scss";

// ─── Helpers ───────────────────────────────────────────────

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  const time = m > 0 ? `${h}:${m.toString().padStart(2, "0")}${ampm}` : `${h}${ampm}`;
  return `${time}, ${days[d.getDay()]} ${getOrdinal(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getResourceName(log: AuditLog): string | null {
  const data = log.action === "DELETE" ? log.old_data : log.new_data;
  if (!data) return null;
  if (typeof data.title === "string" && data.title) return data.title;
  if (typeof data.name === "string" && data.name) return data.name;
  if (typeof data.first_name === "string" && data.first_name) {
    return [data.first_name, data.last_name as string | undefined].filter(Boolean).join(" ");
  }
  return null;
}

function formatMoney(pence: number | null | undefined): string {
  if (!pence) return "";
  return ` (£${(pence / 100).toFixed(2)})`;
}

function formatMessage(log: AuditLog): string {
  const actor = log.actor ? [log.actor.first_name, log.actor.last_name].filter(Boolean).join(" ") : "System";
  const name = getResourceName(log);
  const q = name ? ` '${name}'` : "";

  switch (log.table_name) {
    case "users":
      if (log.action === "INSERT") return `${actor} added client${q}`;
      if (log.action === "UPDATE") return `${actor} updated client${q}`;
      if (log.action === "DELETE") return `${actor} deleted client${q}`;
      break;
    case "client_stubs":
      if (log.action === "INSERT") return `${actor} added offline client${q}`;
      if (log.action === "UPDATE") return `${actor} updated offline client${q}`;
      if (log.action === "DELETE") return `${actor} deleted offline client${q}`;
      break;
    case "sessions": {
      const newStatus = log.new_data?.status as string | undefined;
      const oldPaid = log.old_data?.paid as boolean | undefined;
      const newPaid = log.new_data?.paid as boolean | undefined;
      if (log.action === "INSERT") return `${actor} created a session`;
      if (log.action === "UPDATE") {
        if (newStatus === "cancelled") return `${actor} cancelled a session`;
        if (!oldPaid && newPaid) return `${actor} marked a session as paid`;
        return `${actor} updated a session`;
      }
      if (log.action === "DELETE") return `${actor} deleted a session`;
      break;
    }
    case "payments": {
      const amount = log.action === "DELETE" ? log.old_data?.amount_pence : log.new_data?.amount_pence;
      if (log.action === "INSERT") return `${actor} recorded a manual payment${formatMoney(amount as number)}`;
      if (log.action === "DELETE") return `${actor} removed a payment${formatMoney(amount as number)}`;
      break;
    }
    case "questionnaires":
      if (log.action === "INSERT") return `${actor} created check-in${q}`;
      if (log.action === "UPDATE") return `${actor} updated check-in${q}`;
      if (log.action === "DELETE") return `${actor} deleted check-in${q}`;
      break;
    case "questionnaire_assignments":
      if (log.action === "INSERT") return `${actor} assigned a check-in to a client`;
      if (log.action === "DELETE") return `${actor} removed a check-in assignment`;
      break;
    case "resources":
      if (log.action === "INSERT") return `${actor} added resource${q}`;
      if (log.action === "UPDATE") return `${actor} updated resource${q}`;
      if (log.action === "DELETE") return `${actor} deleted resource${q}`;
      break;
    case "tags":
      if (log.action === "INSERT") return `${actor} created tag${q}`;
      if (log.action === "UPDATE") return `${actor} updated tag${q}`;
      if (log.action === "DELETE") return `${actor} deleted tag${q}`;
      break;
    case "session_notes":
      if (log.action === "INSERT") return `${actor} added a session note`;
      if (log.action === "UPDATE") return `${actor} updated a session note`;
      if (log.action === "DELETE") return `${actor} deleted a session note`;
      break;
  }
  return `${actor} made a change`;
}

// ─── Filters ───────────────────────────────────────────────

const FILTERS = [
  { label: "All", tables: null },
  { label: "Clients", tables: ["users", "client_stubs", "session_notes"] },
  { label: "Sessions", tables: ["sessions"] },
  { label: "Payments", tables: ["payments"] },
  { label: "Check-ins", tables: ["questionnaires", "questionnaire_assignments"] },
  { label: "Resources", tables: ["resources"] },
  { label: "Tags", tables: ["tags"] },
] as const;

type FilterLabel = (typeof FILTERS)[number]["label"];

// ─── Page ──────────────────────────────────────────────────

export default function AdminAuditLogsPage() {
  const dispatch = useAppDispatch();
  const logs = useAppSelector(selectAllAuditLogs);
  const status = useAppSelector(selectAuditLogsStatus);
  const [activeFilter, setActiveFilter] = useState<FilterLabel>("All");
  const [search, setSearch] = useState("");

  useFetchOnIdle(
    (state: RootState) => state.auditLogs.status,
    () => fetchAuditLogs(),
    "Failed to fetch audit logs:",
  );

  useEffect(() => {
    return () => {
      dispatch(resetAuditLogs());
    };
  }, [dispatch]);

  const guard = isPageStatusLoading(status);
  if (guard) return guard;

  const currentFilter = FILTERS.find((f) => f.label === activeFilter)!;
  const byTable = currentFilter.tables
    ? logs.filter((log) => (currentFilter.tables as readonly string[]).includes(log.table_name))
    : logs;
  const q = search.trim().toLowerCase();
  const filtered = q ? byTable.filter((log) => formatMessage(log).toLowerCase().includes(q)) : byTable;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader} id="audit-header">
          <div>
            <h1>Activity</h1>
            <p>
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => dispatch(resetAuditLogs())}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Loading…" : "Refresh"}
          </Button>
        </div>

        <div className={styles.filterRow} id="audit-filters">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                setActiveFilter(f.label);
                setSearch("");
              }}
              className={activeFilter === f.label ? styles.filterBtnActive : styles.filterBtn}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search activity…"
          value={search}
          aria-label="Search activity log"
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className={styles.feed} id="audit-feed">
          {filtered.map((log) => (
            <div key={log.id} className={styles.entry}>
              <span className={styles.message}>{formatMessage(log)}</span>
              <span className={styles.time}> at {formatDateTime(log.created_at)}</span>
            </div>
          ))}

          {filtered.length === 0 && status !== "loading" && <p className={styles.empty}>No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
