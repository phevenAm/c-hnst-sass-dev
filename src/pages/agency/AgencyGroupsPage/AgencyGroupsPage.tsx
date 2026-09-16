import { useEffect, useState } from "react";

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
  const groups = useAppSelector(selectGroups);
  const status = useAppSelector(selectGroupsStatus);

  useEffect(() => {
    if (agency) dispatch(fetchGroups(agency.id));
  }, [dispatch, agency]);

  if (isManager) return <ManagerGroupsView />;
  return <StaffGroupsView groups={groups} status={status} />;
}

// A staff member only ever sees groups they facilitate (RLS scopes fetchGroups
// to that already) — read-only, just enough to know what they're in. No
// member/staff names here: resolving a stub's name needs its own
// client_stubs read, which a facilitator isn't guaranteed to have (that RLS
// is keyed off client_assignments, not group_staff) — counts avoid a wrong
// or blank name rather than risk over- or under-showing who's in the room.
function StaffGroupsView({ groups, status }: { groups: GroupWithRows[]; status: string }) {
  return (
    <div className="inner">
      <div className={styles.header} id="agency-groups-header">
        <div>
          <h1 className={styles.title}>Your groups</h1>
          <p className={styles.subtitle}>Groups you've been added to facilitate.</p>
        </div>
      </div>

      {status === "loading" && groups.length === 0 && <p className={styles.empty}>Loading groups…</p>}
      {status !== "loading" && groups.length === 0 && (
        <p className={styles.empty}>You haven't been added to any groups yet.</p>
      )}

      {groups.length > 0 && (
        <div className={styles.list}>
          {groups.map((g) => (
            <div key={g.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{g.name}</span>
                <span className={styles.rowMeta}>
                  {g.description ? `${g.description} · ` : ""}
                  {g.members.length} client{g.members.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerGroupsView() {
  const dispatch = useAppDispatch();
  const agency = useAppSelector(selectAgency);
  const clients = useAppSelector(selectAgencyClients);
  const staffOptions = useAppSelector(selectAgencyMembers);
  const groups = useAppSelector(selectGroups);
  const status = useAppSelector(selectGroupsStatus);

  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<GroupWithRows | null>(null);

  useEffect(() => {
    if (!agency) return;
    dispatch(fetchAgencyClients(agency.id));
    dispatch(fetchAgencyMembers());
  }, [dispatch, agency]);

  // Keep the open "manage" modal's data fresh as the store updates underneath it.
  useEffect(() => {
    if (!managing) return;
    const fresh = groups.find((g) => g.id === managing.id);
    if (fresh) setManaging(fresh);
  }, [groups, managing]);

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
