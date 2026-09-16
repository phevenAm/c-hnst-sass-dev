import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import AssignClientModal from "@components/agency/AssignClientModal/AssignClientModal";
import Avatar from "@components/shared/Avatar/Avatar";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import Spinner from "@components/shared/Spinner/Spinner";
import { useToast } from "@context/ToastContext";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  removeClientAssignment,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";
import { fetchGroups, selectGroupsForStub, selectGroupsStatus } from "@store/slices/groupsSlice";

import { getErrorMessage } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

type ActivityRow = {
  id: string;
  event_type: string;
  summary: string;
  actor_id: string | null;
  created_at: string;
};

const statusBadge = (status: string | undefined) => {
  if (status === "accepted") return { variant: "success" as const, label: "Active" };
  if (status === "pending") return { variant: "neutral" as const, label: "In review" };
  if (status === "declined") return { variant: "danger" as const, label: "Declined" };
  return { variant: "warning" as const, label: "Unassigned" };
};

export default function AgencyClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const members = useAppSelector(selectAgencyMembers);
  const groups = useAppSelector(selectGroupsForStub(clientId ?? ""));
  const groupsStatus = useAppSelector(selectGroupsStatus);

  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [removingCounsellor, setRemovingCounsellor] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    dispatch(fetchAgencyMembers());
    if (agency) {
      dispatch(fetchAgencyClients(agency.id));
      dispatch(fetchGroups(agency.id));
    }
  }, [dispatch, agency]);

  useEffect(() => {
    if (!clientId) return;
    setLoadingActivity(true);
    supabase
      .from("agency_activity_events")
      .select("id, event_type, summary, actor_id, created_at")
      .eq("subject_type", "client")
      .eq("subject_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setActivity((data as ActivityRow[]) ?? []);
        setLoadingActivity(false);
      });
  }, [clientId]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const client = clients.find((c) => c.id === clientId);
  if (!client) {
    return (
      <div className="inner">
        <Button variant="ghost" size="sm" className={styles.backButton} onClick={() => navigate("/agency/clients")}>
          ← Back to clients
        </Button>
        <p className={styles.empty}>{clients.length === 0 ? "Loading…" : "This client wasn't found."}</p>
      </div>
    );
  }

  const name = `${client.first_name} ${client.last_name}`.trim();
  const assignedName = client.assignment
    ? (() => {
        const m = members.find((mm) => mm.user_id === client.assignment?.to_admin_id);
        return m?.display_name || [m?.first_name, m?.last_name].filter(Boolean).join(" ") || m?.email || "a counsellor";
      })()
    : null;
  const badge = statusBadge(client.assignment?.status);
  const canAssign = !client.assignment || client.assignment.status === "declined";
  const canRemoveCounsellor = client.assignment?.status === "accepted";
  const actorName = (actorId: string | null) => {
    if (!actorId) return "System";
    const m = members.find((mm) => mm.user_id === actorId);
    return m?.display_name || [m?.first_name, m?.last_name].filter(Boolean).join(" ") || m?.email || "Someone";
  };

  const confirmRemoveCounsellor = async () => {
    if (!client.assignment) return;
    setRemoveBusy(true);
    try {
      await dispatch(removeClientAssignment({ assignment_id: client.assignment.id, stub_id: client.id })).unwrap();
      showToast(
        `${assignedName ?? "The counsellor"} removed — ${name || "the client"} is back on the waiting list.`,
        "success",
      );
      setRemovingCounsellor(false);
    } catch (err) {
      showToast(getErrorMessage(err, "Couldn't remove the counsellor"), "error");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="inner">
      <Button variant="ghost" size="sm" className={styles.backButton} onClick={() => navigate("/agency/clients")}>
        ← Back to clients
      </Button>

      <div className={styles.header} id="agency-client-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
          <Avatar name={name || "Client"} size={56} />
          <div>
            <h1 className={styles.title}>{name || "Unnamed client"}</h1>
            <p className={styles.subtitle}>
              <Badge variant={badge.variant}>{badge.label}</Badge>{" "}
              {client.previously_counselled && !client.assignment && (
                <Badge variant="neutral">Previously counselled</Badge>
              )}
              {assignedName && ` · with ${assignedName}`}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          {canAssign && (
            <Button size="sm" onClick={() => setAssigning(true)}>
              {client.assignment?.status === "declined" ? "Reassign" : "Assign"}
            </Button>
          )}
          {canRemoveCounsellor && (
            <Button size="sm" variant="danger" onClick={() => setRemovingCounsellor(true)}>
              Remove counsellor
            </Button>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Contact</h2>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Email</strong>
            <span>{client.email || "Not set"}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Codename</strong>
            <span>{client.codename || "Not set"}</span>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div className={styles.toggleText}>
            <strong>Default rate</strong>
            <span>
              {client.default_rate_pence != null ? `${formatPence(client.default_rate_pence)} / session` : "Not set"}
            </span>
          </div>
        </div>
        {client.assignment?.decline_reason && (
          <div className={styles.settingRow}>
            <div className={styles.toggleText}>
              <strong>Decline reason</strong>
              <span>{client.assignment.decline_reason}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Groups</h2>
        {groupsStatus === "loading" && groups.length === 0 ? (
          <Spinner size={28} />
        ) : groups.length === 0 ? (
          <p className={styles.cardBlurb}>
            Not in any group. Manage groups from the{" "}
            <Button variant="link" size="sm" onClick={() => navigate("/agency/groups")}>
              Groups page
            </Button>
            .
          </p>
        ) : (
          <div className={styles.list}>
            {groups.map((g) => (
              <div key={g.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>{g.name}</span>
                  <span className={styles.rowMeta}>
                    {g.members.length} client{g.members.length === 1 ? "" : "s"} · {g.staff.length} staff
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Audit trail</h2>
        <p className={styles.cardBlurb}>
          Every stage this client has moved through with {agency?.name ?? "your agency"} — assignment, review, and
          status changes.
        </p>
        {loadingActivity ? (
          <Spinner size={28} />
        ) : activity.length === 0 ? (
          <p className={styles.empty}>Nothing recorded yet.</p>
        ) : (
          <div className={styles.list}>
            {activity.map((a) => (
              <div key={a.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>{a.summary}</span>
                  <span className={styles.rowMeta}>
                    {actorName(a.actor_id)} · {new Date(a.created_at).toLocaleString("en-GB")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {assigning && <AssignClientModal client={client} members={members} onClose={() => setAssigning(false)} />}

      {removingCounsellor && (
        <ConfirmModal
          title="Remove counsellor from this client?"
          danger
          confirming={removeBusy}
          onConfirm={confirmRemoveCounsellor}
          onClose={() => setRemovingCounsellor(false)}
        >
          <p>
            {name || "This client"} goes back on the waiting list, marked as previously counselled by{" "}
            {assignedName ?? "this member"}. Their sessions, payments and notes aren't touched — only the live
            assignment ends.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
