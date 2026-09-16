import { useMemo, useState } from "react";

import Button from "@components/shared/Button/Button";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import type { AgencyClient, AgencyMemberWithUser } from "@models/agency";
import form from "@pages/agency/agency.module.scss";
import { useAppDispatch } from "@store/hooks";
import {
  addGroupMember,
  addGroupStaff,
  deleteGroup,
  type GroupWithRows,
  removeGroupMember,
  removeGroupStaff,
} from "@store/slices/groupsSlice";

import { getErrorMessage } from "@/Helpers/Helpers";

const memberName = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function ManageGroupModal({
  group,
  clients,
  staffOptions,
  onClose,
}: {
  group: GroupWithRows;
  clients: AgencyClient[];
  staffOptions: AgencyMemberWithUser[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const memberByUserId = useMemo(() => new Map(staffOptions.map((m) => [m.user_id, m])), [staffOptions]);

  const memberStubIds = new Set(group.members.map((m) => m.stub_id).filter(Boolean));
  const availableClients = clients.filter((c) => !memberStubIds.has(c.id));
  const groupStaffUserIds = new Set(group.staff.map((s) => s.user_id));
  const availableStaff = staffOptions.filter((m) => !groupStaffUserIds.has(m.user_id));

  const [addClientId, setAddClientId] = useState("");
  const [addStaffId, setAddStaffId] = useState("");

  const handleAddMember = async () => {
    if (!addClientId) return;
    setError("");
    setBusyId("add-member");
    try {
      await dispatch(addGroupMember({ group_id: group.id, stub_id: addClientId })).unwrap();
      setAddClientId("");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add that client to the group"));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveMember = async (id: string) => {
    setError("");
    setBusyId(id);
    try {
      await dispatch(removeGroupMember({ id, group_id: group.id })).unwrap();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove that client"));
    } finally {
      setBusyId(null);
    }
  };

  const handleAddStaff = async () => {
    if (!addStaffId) return;
    setError("");
    setBusyId("add-staff");
    try {
      await dispatch(addGroupStaff({ group_id: group.id, user_id: addStaffId })).unwrap();
      setAddStaffId("");
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add that staff member"));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveStaff = async (id: string) => {
    setError("");
    setBusyId(id);
    try {
      await dispatch(removeGroupStaff({ id, group_id: group.id })).unwrap();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove that staff member"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      await dispatch(deleteGroup(group.id)).unwrap();
      showToast("Group deleted.", "success");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete the group"));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <>
      <Modal
        title={group.name}
        onClose={onClose}
        actions={
          <>
            <Button variant="ghost-danger" onClick={() => setConfirmingDelete(true)}>
              Delete group
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className={form.formGrid}>
          {error && <div className={form.error}>{error}</div>}
          {group.description && <p className={form.cardBlurb}>{group.description}</p>}

          <div>
            <h3 className={form.cardTitle}>Clients ({group.members.length})</h3>
            {group.members.length === 0 && <p className={form.cardBlurb}>No clients in this group yet.</p>}
            <div className={form.list}>
              {group.members.map((m) => {
                const c = m.stub_id ? clientById.get(m.stub_id) : null;
                return (
                  <div key={m.id} className={form.row}>
                    <span className={form.rowMain}>{c ? `${c.first_name} ${c.last_name}` : "Unknown client"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={busyId === m.id}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
            {availableClients.length > 0 && (
              <div className={form.rowInline} style={{ marginTop: "var(--sp-3)" }}>
                <select
                  className={form.select}
                  value={addClientId}
                  onChange={(e) => setAddClientId(e.target.value)}
                  aria-label="Add a client to this group"
                >
                  <option value="">Add a client…</option>
                  {availableClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </select>
                <Button onClick={handleAddMember} disabled={!addClientId || busyId === "add-member"}>
                  Add
                </Button>
              </div>
            )}
          </div>

          <div>
            <h3 className={form.cardTitle}>Facilitating staff ({group.staff.length})</h3>
            {group.staff.length === 0 && <p className={form.cardBlurb}>No staff assigned to this group yet.</p>}
            <div className={form.list}>
              {group.staff.map((s) => {
                const m = memberByUserId.get(s.user_id);
                return (
                  <div key={s.id} className={form.row}>
                    <span className={form.rowMain}>{m ? memberName(m) : "Unknown staff member"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveStaff(s.id)}
                      disabled={busyId === s.id}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
            {availableStaff.length > 0 && (
              <div className={form.rowInline} style={{ marginTop: "var(--sp-3)" }}>
                <select
                  className={form.select}
                  value={addStaffId}
                  onChange={(e) => setAddStaffId(e.target.value)}
                  aria-label="Add a staff member to this group"
                >
                  <option value="">Add a staff member…</option>
                  {availableStaff.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberName(m)}
                    </option>
                  ))}
                </select>
                <Button onClick={handleAddStaff} disabled={!addStaffId || busyId === "add-staff"}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {confirmingDelete && (
        <ConfirmModal
          title={`Delete "${group.name}"?`}
          confirmLabel="Yes, delete group"
          confirming={deleting}
          onConfirm={handleDeleteGroup}
          onClose={() => setConfirmingDelete(false)}
        >
          This removes the group and its member/staff list. It doesn't affect any sessions already booked.
        </ConfirmModal>
      )}
    </>
  );
}
