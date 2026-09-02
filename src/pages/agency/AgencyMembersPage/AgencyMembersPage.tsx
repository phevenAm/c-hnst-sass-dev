import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import InviteMemberModal from "@components/agency/InviteMemberModal/InviteMemberModal";
import RemoveMemberModal from "@components/agency/RemoveMemberModal/RemoveMemberModal";
import Badge from "@components/shared/Badge/Badge";
import Button from "@components/shared/Button/Button";
import { useAuth } from "@context/AuthContext";
import type { AgencyMemberWithUser } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyMembers,
  selectAgency,
  selectAgencyMembers,
  selectIsAgencyManager,
  setAgencyMember,
} from "@store/slices/agencySlice";

import styles from "../agency.module.scss";

const displayName = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AgencyMembersPage() {
  const dispatch = useAppDispatch();
  const { authUser } = useAuth();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const members = useAppSelector(selectAgencyMembers);
  const status = useAppSelector((s) => s.agency.membersStatus);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<AgencyMemberWithUser | null>(null);

  useEffect(() => {
    dispatch(fetchAgencyMembers());
  }, [dispatch]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const isOwner = (m: AgencyMemberWithUser) => m.user_id === agency?.owner_id;

  const patch = (fields: Parameters<typeof setAgencyMember>[0]) => dispatch(setAgencyMember(fields));

  return (
    <div>
      <div className={styles.header}>
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
              <div key={m.user_id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowName}>
                    {displayName(m)} {self && <span className={styles.rowMeta}>(you)</span>}
                  </span>
                  <span className={styles.rowMeta}>
                    {m.email} · {m.employment_type}
                    {isOwner(m) && " · owner"}
                  </span>
                </div>

                <div className={styles.rowActions}>
                  <Badge variant={m.status === "active" ? "success" : "danger"}>
                    {m.status === "active" ? "Active" : "Disabled"}
                  </Badge>
                  <Badge variant={m.role === "manager" ? "neutral" : "warning"}>
                    {m.role === "manager" ? "Manager" : "Counsellor"}
                  </Badge>
                  {!m.counselling_enabled && <Badge variant="neutral">Manage-only</Badge>}

                  {!isOwner(m) && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch({
                            member_user_id: m.user_id,
                            role: m.role === "manager" ? "counsellor" : "manager",
                          })
                        }
                      >
                        {m.role === "manager" ? "Make counsellor" : "Make manager"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch({ member_user_id: m.user_id, counselling_enabled: !m.counselling_enabled })
                        }
                      >
                        {m.counselling_enabled ? "Turn off counselling" : "Turn on counselling"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch({
                            member_user_id: m.user_id,
                            status: m.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {m.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      {!self && (
                        <Button size="sm" variant="ghost-danger" onClick={() => setRemoving(m)}>
                          Remove
                        </Button>
                      )}
                    </>
                  )}
                </div>
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
