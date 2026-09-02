import { useMemo, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import type { AgencyMemberWithUser } from "@models/agency";
import form from "@pages/agency/agency.module.scss";
import { useAppDispatch } from "@store/hooks";
import { fetchAgencyMembers, removeAgencyMember } from "@store/slices/agencySlice";

const name = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "this member";

export default function RemoveMemberModal({
  member,
  members,
  onClose,
}: {
  member: AgencyMemberWithUser;
  members: AgencyMemberWithUser[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const destinations = useMemo(
    () => members.filter((m) => m.user_id !== member.user_id && m.status === "active"),
    [members, member.user_id],
  );
  const [reassignTo, setReassignTo] = useState(destinations[0]?.user_id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await dispatch(
        removeAgencyMember({ member_user_id: member.user_id, reassign_to: reassignTo || undefined }),
      ).unwrap();
      dispatch(fetchAgencyMembers());
      showToast(`${name(member)} removed from the agency.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the member");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Remove ${name(member)}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy || destinations.length === 0}>
            {busy ? "Removing…" : "Remove member"}
          </Button>
        </>
      }
    >
      {error && <div className={form.error}>{error}</div>}
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Their clients, sessions and payments move to another counsellor. Session notes and any forms they built stay
        with them.
      </p>

      {destinations.length === 0 ? (
        <p className={form.empty}>You need another active member to take on their clients first.</p>
      ) : (
        <div className={form.field}>
          <label className={form.label} htmlFor="reassign-to">
            Move their clients to
          </label>
          <select
            id="reassign-to"
            className={form.select}
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
          >
            {destinations.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {name(m)}
              </option>
            ))}
          </select>
        </div>
      )}
    </Modal>
  );
}
