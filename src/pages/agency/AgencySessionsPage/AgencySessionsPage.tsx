import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import dayjs from "dayjs";

import { clientDisplayName } from "@Helpers/Helpers";
import { useAppSelector } from "@store/hooks";
import { selectAgencyMembers, selectIsAgencyManager } from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

type SessionRow = {
  id: string;
  scheduled_at: string;
  status: string;
  created_by: string;
  client_id: string | null;
};

type ClientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  admin_codename: string | null;
};

// Read-only, agency-wide upcoming-session list — the manager visibility RLS
// policy (acts_for_admin, 20260902010003) already scopes `sessions` to the
// caller's own rows plus every member's when they're an active manager, so
// this is a plain select with no extra filtering needed.
export default function AgencySessionsPage() {
  const isManager = useAppSelector(selectIsAgencyManager);
  const members = useAppSelector(selectAgencyMembers);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [clients, setClients] = useState<Map<string, ClientRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isManager) return;
    (async () => {
      setLoading(true);
      setError("");
      const from = dayjs().startOf("day").toISOString();
      const to = dayjs().add(30, "day").endOf("day").toISOString();
      const { data, error: fetchErr } = await supabase
        .from("sessions")
        .select("id, scheduled_at, status, created_by, client_id")
        .gte("scheduled_at", from)
        .lte("scheduled_at", to)
        .neq("status", "cancelled")
        .order("scheduled_at", { ascending: true });

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as SessionRow[];
      const clientIds = [...new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id))];
      const { data: clientRows } = clientIds.length
        ? await supabase
            .from("users")
            .select("id, first_name, last_name, display_name, admin_codename")
            .in("id", clientIds)
        : { data: [] };

      setClients(new Map(((clientRows ?? []) as ClientRow[]).map((c) => [c.id, c])));
      setSessions(rows);
      setLoading(false);
    })();
  }, [isManager]);

  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id, m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Staff");
    }
    return map;
  }, [members]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const day = dayjs(s.scheduled_at).format("dddd D MMMM");
      byDay.set(day, [...(byDay.get(day) ?? []), s]);
    }
    return byDay;
  }, [sessions]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Sessions</h1>
          <p className={styles.subtitle}>Upcoming sessions across every staff member, next 30 days.</p>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p className={styles.empty}>Loading sessions…</p>}
      {!loading && sessions.length === 0 && !error && (
        <p className={styles.empty}>Nothing booked across the agency in the next 30 days.</p>
      )}

      {[...grouped.entries()].map(([day, rows]) => (
        <div key={day} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{day}</h2>
            <span className={styles.countPill}>{rows.length}</span>
          </div>
          <div className={styles.list}>
            {rows.map((s) => {
              const client = s.client_id ? clients.get(s.client_id) : undefined;
              return (
                <div key={s.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>
                      {dayjs(s.scheduled_at).format("HH:mm")} · {client ? clientDisplayName(client) : "Offline client"}
                    </span>
                    <span className={styles.rowMeta}>with {memberName.get(s.created_by) ?? "a staff member"}</span>
                  </div>
                  <span className={styles.pill}>{s.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
