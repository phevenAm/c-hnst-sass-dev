import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import InviteMemberModal from "@components/agency/InviteMemberModal/InviteMemberModal";
import RemoveMemberModal from "@components/agency/RemoveMemberModal/RemoveMemberModal";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import type { AgencyMemberWithUser } from "@models/agency";
import { isAgencyOwner } from "@models/agencyPermissions";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
  setAgencyMember,
} from "@store/slices/agencySlice";

import styles from "../agency.module.scss";

const displayName = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AgencyMembersPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { authUser } = useAuth();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const clients = useAppSelector(selectAgencyClients);
  const status = useAppSelector((s) => s.agency.membersStatus);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<AgencyMemberWithUser | null>(null);

  useEffect(() => {
    dispatch(fetchAgencyMembers());
    if (agency) dispatch(fetchAgencyClients(agency.id));
  }, [dispatch, agency]);

  const caseloadByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of clients) {
      if (c.assignment?.status === "accepted") {
        map.set(c.assignment.to_admin_id, (map.get(c.assignment.to_admin_id) ?? 0) + 1);
      }
    }
    return map;
  }, [clients]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const isOwner = (m: AgencyMemberWithUser) => isAgencyOwner(m.user_id, agency);

  const patch = (fields: Parameters<typeof setAgencyMember>[0]) => dispatch(setAgencyMember(fields));

  return (
    <div className="inner">
      <div className={styles.header} id="agency-members-header">
        <div>
          <h1 className={styles.title}>Members</h1>
          <p className={styles.subtitle}>Counsellors and managers in {agency?.name}.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite a member</Button>
      </div>

      {status === "loading" && members.length === 0 && <p className={styles.empty}>Loading members…</p>}
      {status !== "loading" && members.length === 0 && (
        <p className={styles.empty}>No members yet. Invite your first counsellor above.</p>
      )}
      {members.length > 0 && (
        <div className={styles.list}>
          {members.map((m) => {
            const self = m.user_id === authUser?.id;
            return (
              <div
                key={m.user_id}
                className={`${styles.row} ${styles.rowClickable}`}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/agency/members/${m.user_id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/agency/members/${m.user_id}`);
                  }
                }}
              >
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>
                    {displayName(m)} {self && <span className={styles.rowMeta}>(you)</span>}
                    <Badge variant={m.status === "active" ? "success" : "danger"}>
                      {m.status === "active" ? "Active" : "Disabled"}
                    </Badge>
                    <Badge variant={m.role === "manager" ? "neutral" : "warning"}>
                      {m.role === "manager" ? "Manager" : "Counsellor"}
                    </Badge>
                    <Badge variant={m.employment_type === "freelance" ? "neutral" : "success"}>
                      {m.employment_type === "freelance" ? "External" : "Internal"}
                    </Badge>
                    {!m.counselling_enabled && <Badge variant="neutral">Manage-only</Badge>}
                    {m.deletion_requested_at && <Badge variant="danger">Asked to leave</Badge>}
                  </span>
                  <span className={styles.rowMeta}>
                    {[
                      isOwner(m) ? "owner" : null,
                      m.counselling_enabled
                        ? `${caseloadByMember.get(m.user_id) ?? 0} agency client${
                            (caseloadByMember.get(m.user_id) ?? 0) === 1 ? "" : "s"
                          }`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>

                {!isOwner(m) && (
                  <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                    <SplitButton
                      size="sm"
                      variant="secondary"
                      primaryLabel="Manage"
                      primaryAction={() => navigate(`/agency/members/${m.user_id}`)}
                      options={[
                        {
                          label: m.role === "manager" ? "Make counsellor" : "Make manager",
                          onClick: () =>
                            patch({
                              member_user_id: m.user_id,
                              role: m.role === "manager" ? "counsellor" : "manager",
                            }),
                        },
                        {
                          label: m.counselling_enabled ? "Turn off counselling" : "Turn on counselling",
                          onClick: () =>
                            patch({ member_user_id: m.user_id, counselling_enabled: !m.counselling_enabled }),
                        },
                        {
                          label: m.status === "active" ? "Disable" : "Enable",
                          onClick: () =>
                            patch({
                              member_user_id: m.user_id,
                              status: m.status === "active" ? "disabled" : "active",
                            }),
                        },
                        ...(!self ? [{ label: "Remove", onClick: () => setRemoving(m) }] : []),
                      ]}
                      secondaryLabel="More options"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inviteOpen && <InviteMemberModal onClose={() => setInviteOpen(false)} />}
      {removing && <RemoveMemberModal member={removing} members={members} onClose={() => setRemoving(null)} />}
    </div>
  );
}
