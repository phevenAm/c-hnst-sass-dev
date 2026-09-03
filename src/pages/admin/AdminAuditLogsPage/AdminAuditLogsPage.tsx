import { useEffect, useMemo, useState } from "react";

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

const PAGE_SIZE = 40;

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
  if (typeof data.codename === "string" && data.codename) return data.codename;
  if (typeof data.first_name === "string" && data.first_name) {
    return [data.first_name, data.last_name as string | undefined].filter(Boolean).join(" ");
  }
  return null;
}

function formatMoney(pence: number | null | undefined): string {
  if (typeof pence !== "number") return "";
  return ` (£${(pence / 100).toFixed(2)})`;
}

// Human label for a table we don't have a bespoke sentence for.
const TABLE_LABELS: Record<string, string> = {
  users: "client",
  client_stubs: "offline client",
  sessions: "session",
  stub_sessions: "offline-client session",
  payments: "payment",
  questionnaires: "form",
  questionnaire_assignments: "form assignment",
  resources: "resource",
  tags: "tag",
  session_notes: "session note",
  platform_access_token: "invite token",
  admin_reminder_mutes: "session-reminder mute",
  practice_settings: "practice setting",
};

const VERB: Record<AuditLog["action"], string> = { INSERT: "added", UPDATE: "updated", DELETE: "removed" };

function formatMessage(log: AuditLog): string {
  const actor = log.actor ? [log.actor.first_name, log.actor.last_name].filter(Boolean).join(" ") : "System";
  const name = getResourceName(log);
  const q = name ? ` '${name}'` : "";

  switch (log.table_name) {
    case "users":
      if (log.action === "INSERT") return `${actor} added client${q}`;
      if (log.action === "UPDATE") return `${actor} updated client${q}`;
      return `${actor} deleted client${q}`;
    case "client_stubs":
      if (log.action === "INSERT") return `${actor} added offline client${q}`;
      if (log.action === "UPDATE") return `${actor} updated offline client${q}`;
      return `${actor} deleted offline client${q}`;
    case "sessions":
    case "stub_sessions": {
      const who = log.table_name === "stub_sessions" ? " (offline client)" : "";
      const oldStatus = log.old_data?.status as string | undefined;
      const newStatus = log.new_data?.status as string | undefined;
      const oldPaid = log.old_data?.paid as boolean | undefined;
      const newPaid = log.new_data?.paid as boolean | undefined;
      if (log.action === "INSERT") return `${actor} created a session${who}`;
      if (log.action === "UPDATE") {
        if (newStatus === "cancelled" && oldStatus !== "cancelled") return `${actor} cancelled a session${who}`;
        if (oldStatus === "cancelled" && newStatus === "scheduled") return `${actor} restored a session${who}`;
        if (!oldPaid && newPaid) return `${actor} marked a session as paid${who}`;
        if (oldPaid && !newPaid) return `${actor} marked a session as unpaid${who}`;
        return `${actor} updated a session${who}`;
      }
      return `${actor} deleted a session${who}`;
    }
    case "payments": {
      const amount = log.action === "DELETE" ? log.old_data?.amount_pence : log.new_data?.amount_pence;
      if (log.action === "INSERT") return `${actor} recorded a manual payment${formatMoney(amount as number)}`;
      if (log.action === "DELETE") return `${actor} removed a payment${formatMoney(amount as number)}`;
      return `${actor} updated a payment${formatMoney(amount as number)}`;
    }
    case "questionnaires":
      if (log.action === "INSERT") return `${actor} created form${q}`;
      if (log.action === "UPDATE") return `${actor} updated form${q}`;
      return `${actor} deleted form${q}`;
    case "questionnaire_assignments":
      if (log.action === "INSERT") return `${actor} assigned a form to a client`;
      if (log.action === "DELETE") return `${actor} removed a form assignment`;
      return `${actor} updated a form assignment`;
    case "resources":
      if (log.action === "INSERT") return `${actor} added resource${q}`;
      if (log.action === "UPDATE") return `${actor} updated resource${q}`;
      return `${actor} deleted resource${q}`;
    case "tags":
      if (log.action === "INSERT") return `${actor} created tag${q}`;
      if (log.action === "UPDATE") return `${actor} updated tag${q}`;
      return `${actor} deleted tag${q}`;
    case "session_notes":
      if (log.action === "INSERT") return `${actor} added a session note`;
      if (log.action === "UPDATE") return `${actor} updated a session note`;
      return `${actor} deleted a session note`;
    case "platform_access_token":
      if (log.action === "INSERT") return `${actor} created a client invite`;
      if (log.action === "UPDATE" && log.new_data?.is_used) return `A client used their invite to sign up`;
      return `${actor} updated a client invite`;
    case "admin_reminder_mutes":
      if (log.action === "INSERT") return `${actor} muted a session reminder`;
      return `${actor} un-muted a session reminder`;
    default:
      break;
  }

  const label = TABLE_LABELS[log.table_name] ?? log.table_name.replace(/_/g, " ");
  return `${actor} ${VERB[log.action]} ${label}${q}`;
}

// Fields whose before/after is worth showing on an UPDATE row. Everything else
// (timestamps, ids, derived columns) is noise.
const INTERESTING_FIELDS = new Set([
  "status",
  "paid",
  "attended",
  "scheduled_at",
  "duration_minutes",
  "price_pence",
  "amount_pence",
  "amount_paid",
  "title",
  "name",
  "category",
  "is_published",
  "is_pinned",
  "is_active",
  "admin_codename",
  "disabled",
  "archived_at",
  "first_name",
  "last_name",
  "email",
  "profile_show_age",
  "profile_show_email",
  "profile_show_last_seen",
  "location",
  "is_recurring",
  "session_count",
]);

function prettyValue(key: string, val: unknown): string {
  if (val == null || val === "") return "—";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if ((key === "price_pence" || key === "amount_pence") && typeof val === "number") {
    return `£${(val / 100).toFixed(2)}`;
  }
  if (key === "scheduled_at" || key === "archived_at") {
    const d = new Date(String(val));
    if (!Number.isNaN(d.getTime())) return formatDateTime(d.toISOString());
  }
  return String(val);
}

type FieldChange = { field: string; from: string; to: string };

function changedFields(log: AuditLog): FieldChange[] {
  if (log.action !== "UPDATE" || !log.old_data || !log.new_data) return [];
  const out: FieldChange[] = [];
  for (const key of Object.keys(log.new_data)) {
    if (!INTERESTING_FIELDS.has(key)) continue;
    const before = log.old_data[key];
    const after = log.new_data[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    out.push({ field: key.replace(/_/g, " "), from: prettyValue(key, before), to: prettyValue(key, after) });
  }
  return out;
}

// ─── Filters ───────────────────────────────────────────────

const FILTERS = [
  { label: "All", tables: null },
  { label: "Clients", tables: ["users", "client_stubs", "session_notes", "platform_access_token"] },
  { label: "Sessions", tables: ["sessions", "stub_sessions", "admin_reminder_mutes"] },
  { label: "Payments", tables: ["payments"] },
  { label: "Forms", tables: ["questionnaires", "questionnaire_assignments"] },
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

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

  // Changing what's shown snaps paging back to the first page.
  const pickFilter = (label: FilterLabel) => {
    setActiveFilter(label);
    setSearch("");
    setVisibleCount(PAGE_SIZE);
    setExpanded(null);
  };
  const onSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(PAGE_SIZE);
    setExpanded(null);
  };

  const currentFilter = FILTERS.find((f) => f.label === activeFilter) ?? FILTERS[0];

  const filtered = useMemo(() => {
    const byTable = currentFilter.tables
      ? logs.filter((log) => (currentFilter.tables as readonly string[]).includes(log.table_name))
      : logs;
    const q = search.trim().toLowerCase();
    if (!q) return byTable;
    return byTable.filter((log) => {
      if (formatMessage(log).toLowerCase().includes(q)) return true;
      return changedFields(log).some(
        (c) => c.field.includes(q) || c.from.toLowerCase().includes(q) || c.to.toLowerCase().includes(q),
      );
    });
  }, [logs, currentFilter, search]);

  const guard = isPageStatusLoading(status);
  if (guard) return guard;

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader} id="audit-header">
          <div>
            <h1>Activity</h1>
            <p>
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
              {visible.length < filtered.length ? ` — showing ${visible.length}` : ""}
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
              onClick={() => pickFilter(f.label)}
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
          onChange={(e) => onSearch(e.target.value)}
        />

        <div className={styles.feed} id="audit-feed">
          {visible.map((log) => {
            const changes = changedFields(log);
            const isOpen = expanded === log.id;
            return (
              <div key={log.id} className={styles.entry}>
                <button
                  type="button"
                  className={styles.entryHead}
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  aria-expanded={isOpen}
                >
                  <span>
                    <span className={styles.message}>{formatMessage(log)}</span>
                    <span className={styles.time}> at {formatDateTime(log.created_at)}</span>
                  </span>
                  {changes.length > 0 && (
                    <span className={styles.changeCount}>
                      {isOpen ? "Hide" : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
                    </span>
                  )}
                </button>

                {isOpen && changes.length > 0 && (
                  <ul className={styles.changeList}>
                    {changes.map((c) => (
                      <li key={c.field}>
                        <span className={styles.changeField}>{c.field}</span>
                        <span className={styles.changeFrom}>{c.from}</span>
                        <span className={styles.changeArrow}>→</span>
                        <span className={styles.changeTo}>{c.to}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && status !== "loading" && <p className={styles.empty}>No activity yet.</p>}
        </div>

        {visible.length < filtered.length && (
          <div className={styles.loadMore}>
            <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
              Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
