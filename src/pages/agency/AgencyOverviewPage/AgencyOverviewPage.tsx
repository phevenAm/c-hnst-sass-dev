import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import DonutChart, { type DonutSlice } from "@components/shared/DonutChart/DonutChart";
import type { AgencyFinanceSummary } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyInvoices,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyInvoices,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

const memberLabel = (m: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) => m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AgencyOverviewPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const clients = useAppSelector(selectAgencyClients);
  const invoices = useAppSelector(selectAgencyInvoices);
  const [finance, setFinance] = useState<AgencyFinanceSummary | null>(null);

  useEffect(() => {
    if (!isManager || !agency) return;
    dispatch(fetchAgencyMembers());
    dispatch(fetchAgencyClients(agency.id));
    dispatch(fetchAgencyInvoices());
    supabase.rpc("agency_finance_summary", {}).then(({ data }) => {
      if (data) setFinance(data as AgencyFinanceSummary);
    });
  }, [dispatch, isManager, agency]);

  const stats = useMemo(() => {
    const pending = clients.filter((c) => c.assignment?.status === "pending").length;
    const unassigned = clients.filter((c) => !c.assignment).length;
    const declined = clients.filter((c) => c.assignment?.status === "declined").length;
    const onCaseload = clients.filter((c) => c.assignment?.status === "accepted").length;
    const activeMembers = members.filter((m) => m.status === "active");

    const caseloadByMember = new Map<string, number>();
    for (const c of clients) {
      if (c.assignment?.status === "accepted") {
        caseloadByMember.set(c.assignment.to_admin_id, (caseloadByMember.get(c.assignment.to_admin_id) ?? 0) + 1);
      }
    }
    const workload = activeMembers
      .filter((m) => m.counselling_enabled)
      .map((m) => ({ name: memberLabel(m), count: caseloadByMember.get(m.user_id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
    const maxLoad = Math.max(1, ...workload.map((w) => w.count));

    return { pending, unassigned, declined, onCaseload, activeMembers, workload, maxLoad };
  }, [clients, members]);

  const invoiceStats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "due").length;
    const overdue = invoices.filter((i) => i.status === "overdue").length;
    return { outstanding, overdue };
  }, [invoices]);

  const unsignedAgreements = useMemo(() => {
    if (!agency?.staff_agreement_required) return 0;
    return stats.activeMembers.filter((m) => m.user_id !== agency?.owner_id && !m.agreement_accepted_at).length;
  }, [stats.activeMembers, agency?.owner_id, agency?.staff_agreement_required]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  // Hex (not CSS vars) — recharts writes these straight into an SVG fill attr.
  const statusSlices: DonutSlice[] = [
    { name: "Unassigned", value: stats.unassigned, color: "#c98a1a" },
    { name: "Awaiting review", value: stats.pending, color: "#3f7d6e" },
    { name: "With a counsellor", value: stats.onCaseload, color: "#1f4940" },
    { name: "Declined", value: stats.declined, color: "#b23b3b" },
  ];
  const totalClients = stats.unassigned + stats.pending + stats.onCaseload + stats.declined;

  const attention: string[] = [];
  if (stats.unassigned) attention.push(`${stats.unassigned} client${stats.unassigned > 1 ? "s" : ""} not yet assigned`);
  if (stats.pending)
    attention.push(`${stats.pending} assignment${stats.pending > 1 ? "s" : ""} awaiting a counsellor's response`);
  if (stats.declined)
    attention.push(`${stats.declined} declined assignment${stats.declined > 1 ? "s" : ""} to reassign`);
  const idleMembers = stats.workload.filter((w) => w.count === 0).length;
  if (idleMembers) attention.push(`${idleMembers} counsellor${idleMembers > 1 ? "s have" : " has"} no clients yet`);
  if (invoiceStats.overdue)
    attention.push(`${invoiceStats.overdue} agency invoice${invoiceStats.overdue > 1 ? "s are" : " is"} overdue`);
  if (unsignedAgreements)
    attention.push(
      `${unsignedAgreements} staff member${unsignedAgreements > 1 ? "s haven't" : " hasn't"} accepted the working agreement`,
    );

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{agency?.name}</h1>
          <p className={styles.subtitle}>Everything across your agency at a glance.</p>
        </div>
      </div>

      <div className={styles.tiles}>
        <Tile label="Active members" value={stats.activeMembers.length} to="/agency/members" />
        <Tile label="Total clients" value={totalClients} to="/agency/clients" />
        <Tile label="Awaiting review" value={stats.pending} hint="assigned, not accepted" to="/agency/clients" />
        <Tile
          label="Net (30 days)"
          value={finance ? formatPence(finance.net_pence) : "—"}
          hint={finance ? `${formatPence(finance.income_pence)} in · ${formatPence(finance.outgoings_pence)} out` : ""}
          to="/agency/finance"
        />
        <Tile
          label="Agency invoices"
          value={invoiceStats.outstanding + invoiceStats.overdue}
          hint={invoiceStats.overdue ? `${invoiceStats.overdue} overdue` : "outstanding"}
          to="/agency/invoices"
        />
      </div>

      <div className={styles.grid2}>
        {totalClients > 0 ? (
          <DonutChart
            title="Client pipeline"
            slices={statusSlices}
            centerValue={String(totalClients)}
            centerLabel={totalClients === 1 ? "client" : "clients"}
          />
        ) : (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Client pipeline</h3>
            <p className={styles.empty}>Add a client to get started.</p>
          </div>
        )}

        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Counsellor workload</h3>
          {stats.workload.length === 0 ? (
            <p className={styles.empty}>No counsellors taking clients yet.</p>
          ) : (
            stats.workload.map((w) => (
              <div key={w.name} className={styles.barRow}>
                <span className={styles.barLabel}>{w.name}</span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${(w.count / stats.maxLoad) * 100}%` }} />
                </span>
                <span className={styles.barValue}>{w.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Needs attention</h3>
        {attention.length === 0 ? (
          <p className={styles.empty}>Nothing outstanding — nice.</p>
        ) : (
          attention.map((a) => (
            <div key={a} className={styles.attention}>
              <span>{a}</span>
            </div>
          ))
        )}
        <div style={{ marginTop: "var(--sp-4)" }}>
          <Link to="/agency/clients" className={styles.textLink}>
            Manage clients →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, to }: { label: string; value: string | number; hint?: string; to: string }) {
  return (
    <Link to={to} className={styles.tile} style={{ textDecoration: "none", display: "block" }}>
      <p className={styles.tileLabel}>{label}</p>
      <div className={styles.tileValue}>{value}</div>
      {hint && <div className={styles.tileHint}>{hint}</div>}
    </Link>
  );
}
