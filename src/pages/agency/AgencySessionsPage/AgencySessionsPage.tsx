import { useCallback, useEffect, useMemo, useState } from "react";
import { type View, Views } from "react-big-calendar";
import { Navigate } from "react-router-dom";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import SchedulerCalendar from "@components/shared/SchedulerCalendar/SchedulerCalendar";
import type { SchedulerEvent } from "@components/shared/SchedulerCalendar/schedulerUtils";
import SegmentedTabs from "@components/shared/SegmentedTabs/SegmentedTabs";
import Spinner from "@components/shared/Spinner/Spinner";
import type { ClientStub, Session, StubSession, UserProfile } from "@models/globalTypes";
import { useAppSelector } from "@store/hooks";
import { selectAgencyMembers, selectIsAgencyManager } from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";

const DEFAULT_MEMBER_COLOR = "#2d7264";
const HIDDEN_STAFF_KEY = "agencySessionsHiddenStaff";

type StaffFilter = "all" | "internal" | "external";
type ViewMode = "calendar" | "list";

const readHiddenStaff = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_STAFF_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

// One shape for both real (public.sessions) and offline/stub
// (public.stub_sessions) rows, so filtering/search/calendar-mapping below
// doesn't need two parallel pipelines. `ownerId` is created_by for a real
// session, admin_id for a stub one — both are "the staff member whose
// calendar this belongs to".
type AgencyEntry = {
  id: string;
  ownerId: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string;
  clientName: string;
  isStub: boolean;
  session?: Session;
  stubSession?: StubSession;
  stub?: ClientStub;
};

// Read-only, agency-wide sessions calendar. The manager visibility RLS policy
// (acts_for_admin, 20260902010003) already scopes `sessions`/`stub_sessions`
// to the caller's own rows plus every member's when they're an active
// manager, so these are plain selects with no extra filtering needed.
export default function AgencySessionsPage() {
  const isManager = useAppSelector(selectIsAgencyManager);
  const members = useAppSelector(selectAgencyMembers);

  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<View>(Views.WORK_WEEK);
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [mode, setMode] = useState<ViewMode>("calendar");
  const [query, setQuery] = useState("");
  const [hiddenStaff, setHiddenStaff] = useState<Set<string>>(readHiddenStaff);
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [stubSessions, setStubSessions] = useState<StubSession[]>([]);
  const [stubs, setStubs] = useState<ClientStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isManager) return;
    (async () => {
      setLoading(true);
      setError("");
      const from = dayjs(date).subtract(7, "day").startOf("day").toISOString();
      const to = dayjs(date).add(7, "day").endOf("day").toISOString();

      const [sessionsRes, stubSessionsRes] = await Promise.all([
        supabase.from("sessions").select("*").gte("scheduled_at", from).lte("scheduled_at", to),
        // Offline (stub) clients never had their sessions surfaced here at
        // all — a staff member's stub-client bookings just silently never
        // appeared on this page, with no error to explain why.
        supabase.from("stub_sessions").select("*").gte("scheduled_at", from).lte("scheduled_at", to),
      ]);

      if (sessionsRes.error || stubSessionsRes.error) {
        setError(sessionsRes.error?.message || stubSessionsRes.error?.message || "Failed to load sessions.");
        setLoading(false);
        return;
      }

      const rows = (sessionsRes.data ?? []) as Session[];
      const stubRows = (stubSessionsRes.data ?? []) as StubSession[];

      const clientIds = [...new Set(rows.map((r) => r.client_id).filter((id): id is string => !!id))];
      const stubIds = [...new Set(stubRows.map((r) => r.stub_id).filter((id): id is string => !!id))];
      const [{ data: clientRows }, { data: stubRows2 }] = await Promise.all([
        clientIds.length
          ? supabase.from("users").select("*").in("id", clientIds)
          : Promise.resolve({ data: [] as UserProfile[] }),
        stubIds.length
          ? supabase.from("client_stubs").select("*").in("id", stubIds)
          : Promise.resolve({ data: [] as ClientStub[] }),
      ]);

      setClients((clientRows ?? []) as UserProfile[]);
      setStubs((stubRows2 ?? []) as ClientStub[]);
      setSessions(rows);
      setStubSessions(stubRows);
      setLoading(false);
    })();
  }, [isManager, date]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const stubById = useMemo(() => new Map(stubs.map((s) => [s.id, s])), [stubs]);

  const entries = useMemo<AgencyEntry[]>(() => {
    const fromSessions: AgencyEntry[] = sessions.map((s) => {
      const client = clientById.get(s.client_id ?? "");
      const clientName =
        client?.display_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "Client";
      return {
        id: `session-${s.id}`,
        ownerId: s.created_by,
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes,
        status: s.status,
        clientName,
        isStub: false,
        session: s,
      };
    });

    const fromStubs: AgencyEntry[] = stubSessions.flatMap((s) => {
      const stub = stubById.get(s.stub_id);
      // The stub row hasn't loaded (or was deleted) — skip rather than show
      // a session with no client to attribute it to.
      if (!stub) return [];
      // Real clients above show their full name unconditionally too (this
      // page has no per-member codename-mode awareness) — matching that
      // rather than showing a codename a manager may not expect.
      const clientName = [stub.first_name, stub.last_name].filter(Boolean).join(" ") || "Client";
      return [
        {
          id: `stub-session-${s.id}`,
          ownerId: s.admin_id,
          scheduledAt: s.scheduled_at,
          durationMinutes: s.duration_minutes,
          status: s.status,
          clientName,
          isStub: true,
          stubSession: s,
          stub,
        },
      ];
    });

    return [...fromSessions, ...fromStubs].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [sessions, stubSessions, clientById, stubById]);

  const visibleEntries = useMemo(() => {
    return entries.filter((e) => {
      if (hiddenStaff.has(e.ownerId)) return false;
      if (filter === "all") return true;
      const m = memberById.get(e.ownerId);
      const isExternal = m?.employment_type === "freelance";
      return filter === "external" ? isExternal : !isExternal;
    });
  }, [entries, filter, memberById, hiddenStaff]);

  const toggleStaffVisibility = (userId: string) => {
    setHiddenStaff((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      try {
        localStorage.setItem(HIDDEN_STAFF_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const staffNameFor = useCallback(
    (ownerId: string) => {
      const staff = memberById.get(ownerId);
      return staff?.display_name || [staff?.first_name, staff?.last_name].filter(Boolean).join(" ") || "a staff member";
    },
    [memberById],
  );

  const searchedEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleEntries;
    return visibleEntries.filter((e) => `${e.clientName} ${staffNameFor(e.ownerId)}`.toLowerCase().includes(q));
  }, [visibleEntries, query, staffNameFor]);

  const events = useMemo<SchedulerEvent[]>(() => {
    return visibleEntries.map((e) => {
      const staff = memberById.get(e.ownerId);
      const start = new Date(e.scheduledAt);
      const end = dayjs(start)
        .add(e.durationMinutes ?? 50, "minute")
        .toDate();
      const color = staff?.color || DEFAULT_MEMBER_COLOR;
      const clientName = `${e.clientName} · ${staffNameFor(e.ownerId)}`;
      const cancelled = e.status === "cancelled";

      if (e.isStub && e.stubSession && e.stub) {
        return {
          id: e.id,
          title: e.clientName,
          start,
          end,
          resource: {
            type: cancelled ? ("cancelled-stub-session" as const) : ("stub-session" as const),
            stubSession: e.stubSession,
            stub: e.stub,
            color,
            clientName,
          },
        };
      }
      return {
        id: e.id,
        title: e.clientName,
        start,
        end,
        resource: {
          type: cancelled ? ("cancelled-session" as const) : ("session" as const),
          session: e.session as Session,
          color,
          clientName,
        },
      };
    });
  }, [visibleEntries, memberById, staffNameFor]);

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

          <Button variant="ghost" size="sm" onClick={() => setStaffPickerOpen(true)} aria-expanded={staffPickerOpen}>
            {hiddenStaff.size > 0 ? `Show/hide staff (${hiddenStaff.size} hidden)` : "Show/hide staff"}
          </Button>
          {staffPickerOpen && (
            <Modal title="Show/hide staff" onClose={() => setStaffPickerOpen(false)} size="sm">
              <p className={styles.cardBlurb} style={{ marginTop: 0 }}>
                Untick anyone whose sessions you don't want to see on this calendar. Only affects your own view.
              </p>
              {members.map((m) => {
                const label =
                  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";
                return (
                  <label key={m.user_id} className={styles.toggleRow}>
                    <span className={styles.toggleText}>{label}</span>
                    <input
                      type="checkbox"
                      checked={!hiddenStaff.has(m.user_id)}
                      onChange={() => toggleStaffVisibility(m.user_id)}
                    />
                  </label>
                );
              })}
            </Modal>
          )}
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
        {loading && entries.length === 0 ? (
          <div className={styles.empty}>
            <Spinner size={28} />
          </div>
        ) : mode === "calendar" ? (
          <SchedulerCalendar events={events} date={date} view={view} onNavigate={setDate} onView={setView} />
        ) : searchedEntries.length === 0 ? (
          <p className={styles.empty}>No sessions match.</p>
        ) : (
          <div className={styles.list}>
            {searchedEntries.map((e) => (
              <div key={e.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>
                    {e.clientName} · {staffNameFor(e.ownerId)}
                  </span>
                  <span className={styles.rowMeta}>
                    {dayjs(e.scheduledAt).format("ddd D MMM, h:mma")}
                    {e.status === "cancelled" && " · Cancelled"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
