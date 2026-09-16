import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import CreateGroupModal from "@components/agency/CreateGroupModal/CreateGroupModal";
import ManageGroupModal from "@components/agency/ManageGroupModal/ManageGroupModal";
import Button from "@components/shared/Button/Button";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchAgencyClients,
  fetchAgencyMembers,
  selectAgency,
  selectAgencyClients,
  selectAgencyMembers,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";
import { fetchGroups, type GroupWithRows, selectGroups, selectGroupsStatus } from "@store/slices/groupsSlice";

import styles from "../agency.module.scss";

export default function AgencyGroupsPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const staffOptions = useAppSelector(selectAgencyMembers);
  const groups = useAppSelector(selectGroups);
  const status = useAppSelector(selectGroupsStatus);

  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<GroupWithRows | null>(null);

  useEffect(() => {
    if (!agency) return;
    dispatch(fetchGroups(agency.id));
    dispatch(fetchAgencyClients(agency.id));
    dispatch(fetchAgencyMembers());
  }, [dispatch, agency]);

  // Keep the open "manage" modal's data fresh as the store updates underneath it.
  useEffect(() => {
    if (!managing) return;
    const fresh = groups.find((g) => g.id === managing.id);
    if (fresh) setManaging(fresh);
  }, [groups, managing]);

  if (!isManager) return <Navigate to="/agency" replace />;

  return (
    <div className="inner">
      <div className={styles.header} id="agency-groups-header">
        <div>
          <h1 className={styles.title}>Groups</h1>
          <p className={styles.subtitle}>
            Clients seen together, like a group-therapy session. Group booking and calendar support are coming soon —
            for now this manages who's in each group.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New group</Button>
      </div>

      {status === "loading" && groups.length === 0 && <p className={styles.empty}>Loading groups…</p>}
      {status !== "loading" && groups.length === 0 && (
        <p className={styles.empty}>No groups yet. Create one to start organising clients seen together.</p>
      )}

      {groups.length > 0 && (
        <div className={styles.list}>
          {groups.map((g) => (
            <div
              key={g.id}
              className={`${styles.row} ${styles.rowClickable}`}
              role="button"
              tabIndex={0}
              onClick={() => setManaging(g)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setManaging(g);
                }
              }}
            >
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

      {creating && agency && <CreateGroupModal agencyId={agency.id} onClose={() => setCreating(false)} />}
      {managing && (
        <ManageGroupModal
          group={managing}
          clients={clients}
          staffOptions={staffOptions}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
