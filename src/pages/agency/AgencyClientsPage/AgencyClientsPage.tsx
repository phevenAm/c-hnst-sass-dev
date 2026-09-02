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

export default function AgencyClientsPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const members = useAppSelector(selectAgencyMembers);
  const status = useAppSelector((s) => s.agency.clientsStatus);

  const [intakeOpen, setIntakeOpen] = useState(false);
  const [assigning, setAssigning] = useState<AgencyClient | null>(null);

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

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const statusFor = (c: AgencyClient) => {
    const a = c.assignment;
    if (!a) return { label: "Unassigned", variant: "warning" as const };
    if (a.status === "pending")
      return { label: `Awaiting ${nameByUserId.get(a.to_admin_id) ?? "review"}`, variant: "neutral" as const };
    if (a.status === "accepted")
      return { label: `With ${nameByUserId.get(a.to_admin_id) ?? "a counsellor"}`, variant: "success" as const };
    return { label: "Declined", variant: "danger" as const };
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Clients</h1>
          <p className={styles.subtitle}>Everyone your agency has taken on, and who's working with them.</p>
        </div>
        <Button onClick={() => setIntakeOpen(true)}>Add a client</Button>
      </div>

      {status === "loading" && clients.length === 0 && <p className={styles.empty}>Loading clients…</p>}
      {status !== "loading" && clients.length === 0 && (
        <p className={styles.empty}>No clients yet. Add your first above, then assign them to a counsellor.</p>
      )}
      {clients.length > 0 && (
        <div className={styles.list}>
          {clients.map((c) => {
            const s = statusFor(c);
            const canAssign = !c.assignment || c.assignment.status === "declined";
            return (
              <div key={c.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>
                    {c.first_name} {c.last_name}
                  </span>
                  <span className={styles.rowMeta}>
                    {c.email || "No email"}
                    {c.default_rate_pence != null && ` · ${formatPence(c.default_rate_pence)} / session`}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Badge variant={s.variant}>{s.label}</Badge>
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
      )}

      {intakeOpen && agency && <IntakeClientModal agencyId={agency.id} onClose={() => setIntakeOpen(false)} />}
      {assigning && <AssignClientModal client={assigning} members={members} onClose={() => setAssigning(null)} />}
    </div>
  );
}
