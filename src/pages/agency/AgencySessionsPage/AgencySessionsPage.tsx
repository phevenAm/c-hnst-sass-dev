import { useEffect, useMemo, useState } from "react";
import { type View, Views } from "react-big-calendar";
import { Navigate } from "react-router-dom";

import dayjs from "dayjs";

import SchedulerCalendar from "@components/shared/SchedulerCalendar/SchedulerCalendar";
import type { SchedulerEvent } from "@components/shared/SchedulerCalendar/schedulerUtils";
import SegmentedTabs from "@components/shared/SegmentedTabs/SegmentedTabs";
import type { Session, UserProfile } from "@models/globalTypes";
import { useAppSelector } from "@store/hooks";
import { selectAgencyMembers, selectIsAgencyManager } from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

const DEFAULT_MEMBER_COLOR = "#2d7264";

type StaffFilter = "all" | "internal" | "external";
type ViewMode = "calendar" | "list";

// Read-only, agency-wide sessions calendar. The manager visibility RLS policy
// (acts_for_admin, 20260902010003) already scopes `sessions` to the caller's
// own rows plus every member's when they're an active manager, so this is a
// plain select with no extra filtering needed.
export default function AgencySessionsPage() {
  const isManager = useAppSelector(selectIsAgencyManager);
  const members = useAppSelector(selectAgencyMembers);

  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<View>(Views.WORK_WEEK);
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [mode, setMode] = useState<ViewMode>("calendar");
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isManager) return;
    (async () => {
      setLoading(true);
      setError("");
      const from = dayjs(date).subtract(7, "day").startOf("day").toISOString();
      const to = dayjs(date).add(7, "day").endOf("day").toISOString();
      const { data, error: fetchErr } = await supabase
        .from("sessions")
        .select("*")
        .gte("scheduled_at", from)
        .lte("scheduled_at", to)
        .order("scheduled_at", { ascending: true });

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Session[];
      const clientIds = [...new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id))];
      const { data: clientRows } = clientIds.length
        ? await supabase.from("users").select("*").in("id", clientIds)
        : { data: [] };

      setClients((clientRows ?? []) as UserProfile[]);
      setSessions(rows);
      setLoading(false);
    })();
  }, [isManager, date]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const visibleSessions = useMemo(() => {
    if (filter === "all") return sessions;
    return sessions.filter((s) => {
      const m = memberById.get(s.created_by);
      const isExternal = m?.employment_type === "freelance";
      return filter === "external" ? isExternal : !isExternal;
    });
  }, [sessions, filter, memberById]);

  const namesBySessionId = useMemo(() => {
    const map = new Map<string, { staffName: string; clientName: string }>();
    for (const s of sessions) {
      const staff = memberById.get(s.created_by);
      const staffName =
        staff?.display_name || [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || "a staff member";
      const client = clientById.get(s.client_id ?? "");
      const clientName =
        client?.display_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "Client";
      map.set(s.id, { staffName, clientName });
    }
    return map;
  }, [sessions, memberById, clientById]);

  const searchedSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleSessions;
    return visibleSessions.filter((s) => {
      const names = namesBySessionId.get(s.id);
      return `${names?.clientName ?? ""} ${names?.staffName ?? ""}`.toLowerCase().includes(q);
    });
  }, [visibleSessions, query, namesBySessionId]);

  const events = useMemo<SchedulerEvent[]>(() => {
    return visibleSessions.map((s) => {
      const staff = memberById.get(s.created_by);
      const names = namesBySessionId.get(s.id);
      const clientName = names?.clientName ?? "Client";
      const start = new Date(s.scheduled_at);
      const end = dayjs(start)
        .add(s.duration_minutes ?? 50, "minute")
        .toDate();
      return {
        id: `session-${s.id}`,
        title: clientName,
        start,
        end,
        resource: {
          type: s.status === "cancelled" ? ("cancelled-session" as const) : ("session" as const),
          session: s,
          color: staff?.color || DEFAULT_MEMBER_COLOR,
          clientName: `${clientName} · ${names?.staffName ?? "a staff member"}`,
        },
      };
    });
  }, [visibleSessions, memberById, namesBySessionId]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  return (
    <div className="inner">
      <div className={styles.header} id="agency-sessions-header">
        <div>
          <h1 className={styles.title}>Sessions</h1>
          <p className={styles.subtitle}>Every staff member's sessions, coloured by who's running them.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.toolbar} style={{ marginBottom: "var(--sp-4)" }}>
          <SegmentedTabs
            tabs={[
              { value: "all", label: "All staff" },
              { value: "internal", label: "Internal" },
              { value: "external", label: "External" },
            ]}
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter sessions by staff type"
          />
          <SegmentedTabs
            tabs={[
              { value: "calendar", label: "Calendar" },
              { value: "list", label: "List" },
            ]}
            value={mode}
            onChange={setMode}
            ariaLabel="Sessions view"
          />
        </div>

        {mode === "list" && (
          <input
            className={`${styles.input} ${styles.grow}`}
            style={{ marginBottom: "var(--sp-4)" }}
            placeholder="Search sessions by client or staff name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {error && <p className={styles.error}>{error}</p>}
        {loading && sessions.length === 0 ? (
          <p className={styles.empty}>Loading sessions…</p>
        ) : mode === "calendar" ? (
          <SchedulerCalendar events={events} date={date} view={view} onNavigate={setDate} onView={setView} />
        ) : searchedSessions.length === 0 ? (
          <p className={styles.empty}>No sessions match.</p>
        ) : (
          <div className={styles.list}>
            {searchedSessions.map((s) => {
              const names = namesBySessionId.get(s.id);
              return (
                <div key={s.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>
                      {names?.clientName} · {names?.staffName}
                    </span>
                    <span className={styles.rowMeta}>
                      {dayjs(s.scheduled_at).format("ddd D MMM, h:mma")}
                      {s.status === "cancelled" && " · Cancelled"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
