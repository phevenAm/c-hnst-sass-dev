import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import AssignClientModal from "@components/agency/AssignClientModal/AssignClientModal";
import IntakeClientModal from "@components/agency/IntakeClientModal/IntakeClientModal";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import SegmentedTabs from "@components/shared/SegmentedTabs/SegmentedTabs";
import type { AgencyClient } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

type Bucket = "unassigned" | "pending" | "accepted" | "declined";
type View = "waiting" | "active";

const BUCKETS: { key: Bucket; title: string; view: View }[] = [
  { key: "unassigned", title: "Unassigned", view: "waiting" },
  { key: "pending", title: "Awaiting review", view: "waiting" },
  { key: "declined", title: "Declined", view: "waiting" },
  { key: "accepted", title: "With a counsellor", view: "active" },
];

const VIEW_TABS = [
  { value: "waiting" as const, label: "Waiting list" },
  { value: "active" as const, label: "Active caseload" },
];

export default function AgencyClientsPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const members = useAppSelector(selectAgencyMembers);
  const status = useAppSelector((s) => s.agency.clientsStatus);

  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get("view") === "active" ? "active" : "waiting";
  const setView = (v: View) => setSearchParams((p) => ({ ...Object.fromEntries(p), view: v }), { replace: true });

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [assigning, setAssigning] = useState<AgencyClient | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!agency) return;
    dispatch(fetchAgencyClients(agency.id));
    dispatch(fetchAgencyMembers());
  }, [dispatch, agency]);

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(
        m.user_id,
        m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "a counsellor",
      );
    }
    return map;
  }, [members]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const g: Record<Bucket, AgencyClient[]> = { unassigned: [], pending: [], accepted: [], declined: [] };
    for (const c of clients) {
      if (q && !`${c.first_name} ${c.last_name} ${c.email ?? ""}`.toLowerCase().includes(q)) continue;
      const s = c.assignment?.status;
      g[s ?? "unassigned"].push(c);
    }
    return g;
  }, [clients, query]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const total = clients.length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Clients</h1>
          <p className={styles.subtitle}>Everyone your agency has taken on, and who's working with them.</p>
        </div>
        <Button onClick={() => setIntakeOpen(true)}>Add a client</Button>
      </div>

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <SegmentedTabs tabs={VIEW_TABS} value={view} onChange={setView} ariaLabel="Client list scope" />
      </div>

      {total > 0 && (
        <div className={styles.toolbar}>
          <input
            className={`${styles.input} ${styles.grow}`}
            placeholder="Search clients by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {status === "loading" && total === 0 && <p className={styles.empty}>Loading clients…</p>}
      {status !== "loading" && total === 0 && (
        <p className={styles.empty}>No clients yet. Add your first above, then assign them to a counsellor.</p>
      )}
      {status !== "loading" &&
        total > 0 &&
        BUCKETS.filter((b) => b.view === view).every((b) => grouped[b.key].length === 0) && (
          <p className={styles.empty}>
            {view === "waiting"
              ? "Nothing waiting — every client is with a counsellor."
              : "No one on active caseload yet."}
          </p>
        )}

      {BUCKETS.filter((b) => b.view === view).map(({ key, title }) => {
        const rows = grouped[key];
        if (rows.length === 0) return null;
        return (
          <div key={key} className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{title}</h2>
              <span className={styles.countPill}>{rows.length}</span>
            </div>
            <div className={styles.list}>
              {rows.map((c) => {
                const canAssign = !c.assignment || c.assignment.status === "declined";
                const withName = c.assignment ? nameByUserId.get(c.assignment.to_admin_id) : null;
                return (
                  <div key={c.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowName}>
                        {c.first_name} {c.last_name}
                      </span>
                      <span className={styles.rowMeta}>
                        {c.email || "No email"}
                        {c.default_rate_pence != null && ` · ${formatPence(c.default_rate_pence)} / session`}
                        {key === "pending" && withName && ` · with ${withName}`}
                        {key === "accepted" && withName && ` · ${withName}`}
                        {key === "declined" && c.assignment?.decline_reason && ` · "${c.assignment.decline_reason}"`}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      {key === "unassigned" && <Badge variant="warning">Unassigned</Badge>}
                      {key === "pending" && <Badge variant="neutral">In review</Badge>}
                      {key === "accepted" && <Badge variant="success">Active</Badge>}
                      {key === "declined" && <Badge variant="danger">Declined</Badge>}
                      {canAssign && (
                        <Button size="sm" onClick={() => setAssigning(c)}>
                          {c.assignment?.status === "declined" ? "Reassign" : "Assign"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {intakeOpen && agency && <IntakeClientModal agencyId={agency.id} onClose={() => setIntakeOpen(false)} />}
      {assigning && <AssignClientModal client={assigning} members={members} onClose={() => setAssigning(null)} />}
    </div>
  );
}
