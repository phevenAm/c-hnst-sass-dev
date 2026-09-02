import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import type { AgencyFinanceSummary } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

export default function AgencyOverviewPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const clients = useAppSelector(selectAgencyClients);
  const [finance, setFinance] = useState<AgencyFinanceSummary | null>(null);

  useEffect(() => {
    if (!isManager || !agency) return;
    dispatch(fetchAgencyMembers());
    dispatch(fetchAgencyClients(agency.id));
    supabase.rpc("agency_finance_summary", {}).then(({ data }) => {
      if (data) setFinance(data as AgencyFinanceSummary);
    });
  }, [dispatch, isManager, agency]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const activeMembers = members.filter((m) => m.status === "active").length;
  const pending = clients.filter((c) => c.assignment?.status === "pending").length;
  const unassigned = clients.filter((c) => !c.assignment).length;
  const onCaseload = clients.filter((c) => c.assignment?.status === "accepted").length;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{agency?.name}</h1>
          <p className={styles.subtitle}>Everything across your agency at a glance.</p>
        </div>
      </div>

      <div className={styles.tiles}>
        <Tile label="Active members" value={activeMembers} to="/agency/members" />
        <Tile label="Unassigned clients" value={unassigned} to="/agency/clients" />
        <Tile label="Awaiting review" value={pending} hint="assigned, not yet accepted" to="/agency/clients" />
        <Tile label="On a caseload" value={onCaseload} to="/agency/clients" />
      </div>

      <div className={styles.tiles}>
        <Tile label="Income (30 days)" value={finance ? formatPence(finance.income_pence) : "—"} to="/agency/finance" />
        <Tile
          label="Outgoings (30 days)"
          value={finance ? formatPence(finance.outgoings_pence) : "—"}
          to="/agency/finance"
        />
        <Tile label="Net (30 days)" value={finance ? formatPence(finance.net_pence) : "—"} to="/agency/finance" />
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
