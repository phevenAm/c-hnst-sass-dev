import { type FormEvent, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import form from "@pages/agency/agency.module.scss";
import { useAppDispatch } from "@store/hooks";
import { inviteAgencyMember } from "@store/slices/agencySlice";

export default function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"counsellor" | "manager">("counsellor");
  const [employmentType, setEmploymentType] = useState<"employee" | "freelance">("employee");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        inviteAgencyMember({
          email: email.trim().toLowerCase(),
          role,
          employment_type: employmentType,
          message: message.trim() || undefined,
        }),
      ).unwrap();
      showToast(`Invitation sent to ${email.trim()}.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invitation");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Invite a member"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send invitation"}
          </Button>
        </>
      }
    >
      <form className={form.formGrid} onSubmit={submit}>
        {error && <div className={form.error}>{error}</div>}

        <div className={form.field}>
          <label className={form.label} htmlFor="inviteEmail">
            Email address
          </label>
          <input
            id="inviteEmail"
            type="email"
            className={form.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className={form.rowInline}>
          <div className={form.field}>
            <label className={form.label} htmlFor="inviteRole">
              Role
            </label>
            <select
              id="inviteRole"
              className={form.select}
              value={role}
              onChange={(e) => setRole(e.target.value as "counsellor" | "manager")}
            >
              <option value="counsellor">Counsellor</option>
              <option value="manager">Manager (can also manage the agency)</option>
            </select>
          </div>

          <div className={form.field}>
            <label className={form.label} htmlFor="inviteType">
              Works as
            </label>
            <select
              id="inviteType"
              className={form.select}
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as "employee" | "freelance")}
            >
              <option value="employee">Employee</option>
              <option value="freelance">Freelance</option>
            </select>
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="inviteMsg">
            Personal note (optional)
          </label>
          <textarea
            id="inviteMsg"
            className={form.textarea}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Added to the invitation email."
          />
        </div>
      </form>
    </Modal>
  );
}
