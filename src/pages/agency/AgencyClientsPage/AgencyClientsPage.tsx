import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import AssignClientModal from "@components/agency/AssignClientModal/AssignClientModal";
import IntakeClientModal from "@components/agency/IntakeClientModal/IntakeClientModal";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
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

const BUCKETS: { key: Bucket; title: string }[] = [
  { key: "unassigned", title: "Unassigned" },
  { key: "pending", title: "Awaiting review" },
  { key: "accepted", title: "With a counsellor" },
  { key: "declined", title: "Declined" },
];

export default function AgencyClientsPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const members = useAppSelector(selectAgencyMembers);
  const status = useAppSelector((s) => s.agency.clientsStatus);

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

      {BUCKETS.map(({ key, title }) => {
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
