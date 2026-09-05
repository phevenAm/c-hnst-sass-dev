import { useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { AgencyMemberWithUser } from "@models/agency";
import form from "@pages/agency/agency.module.scss";
import { poundsToPence } from "@pages/agency/agencyFormat";
import { useAppDispatch } from "@store/hooks";
import { createAgencyInvoice } from "@store/slices/agencySlice";

const memberName = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AgencyInvoiceModal({
  agencyId,
  members,
  onClose,
}: {
  agencyId: string;
  members: AgencyMemberWithUser[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { authUser } = useAuth();
  const { showToast } = useToast();

  const [staffUserId, setStaffUserId] = useState(members[0]?.user_id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(dayjs());
  const [dueDate, setDueDate] = useState<dayjs.Dayjs | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amountPence = poundsToPence(amount) ?? 0;
  const canSubmit = !!staffUserId && amountPence > 0 && !!authUser;

  const submit = async () => {
    if (!canSubmit || !authUser) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        createAgencyInvoice({
          agency_id: agencyId,
          staff_user_id: staffUserId,
          issued_by: authUser.id,
          description: description.trim() || null,
          amount_pence: amountPence,
          issue_date: issueDate.format("YYYY-MM-DD"),
          due_date: dueDate ? dueDate.format("YYYY-MM-DD") : null,
        }),
      ).unwrap();
      showToast("Invoice created.", "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the invoice");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New agency invoice"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? "Creating…" : "Create invoice"}
          </Button>
        </>
      }
    >
      <div className={form.formGrid}>
        {error && <div className={form.error}>{error}</div>}

        <div className={form.field}>
          <label className={form.label} htmlFor="inv-staff">
            Staff member
          </label>
          <select
            id="inv-staff"
            className={form.select}
            value={staffUserId}
            onChange={(e) => setStaffUserId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberName(m)}
              </option>
            ))}
          </select>
        </div>

        <div className={form.rowInline}>
          <div className={form.field}>
            <label className={form.label} htmlFor="inv-amount">
              Amount (£)
            </label>
            <input
              id="inv-amount"
              type="number"
              min="0"
              step="0.01"
              className={form.input}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className={form.field}>
            <span className={form.label}>Issue date</span>
            <DateInput mode="date" value={issueDate} onChange={(v) => v && setIssueDate(v)} />
          </div>
          <div className={form.field}>
            <span className={form.label}>Due date</span>
            <DateInput mode="date" value={dueDate} onChange={setDueDate} />
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="inv-desc">
            Description
          </label>
          <textarea
            id="inv-desc"
            className={form.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Monthly seat fee — September"
          />
        </div>
      </div>
    </Modal>
  );
}
