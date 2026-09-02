import { type FormEvent, useMemo, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import type { AgencyClient, AgencyMemberWithUser } from "@models/agency";
import form from "@pages/agency/agency.module.scss";
import { penceToPoundsInput, poundsToPence } from "@pages/agency/agencyFormat";
import { useAppDispatch } from "@store/hooks";
import { assignClient, fetchAgencyClients } from "@store/slices/agencySlice";

const memberName = (m: AgencyMemberWithUser) =>
  m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member";

export default function AssignClientModal({
  client,
  members,
  onClose,
}: {
  client: AgencyClient;
  members: AgencyMemberWithUser[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const assignable = useMemo(() => members.filter((m) => m.status === "active" && m.counselling_enabled), [members]);

  const [toAdmin, setToAdmin] = useState(assignable[0]?.user_id ?? "");
  const [rate, setRate] = useState(penceToPoundsInput(client.default_rate_pence));
  const [availability, setAvailability] = useState(client.availability_note ?? "");
  const [intake, setIntake] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!toAdmin) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        assignClient({
          stub_id: client.id,
          to_admin_id: toAdmin,
          rate_pence: rate.trim() ? poundsToPence(rate) : null,
          availability_note: availability.trim() || null,
          intake_note: intake.trim() || null,
        }),
      ).unwrap();
      if (client.agency_id) dispatch(fetchAgencyClients(client.agency_id));
      const target = assignable.find((m) => m.user_id === toAdmin);
      showToast(
        `${client.first_name} sent to ${target ? memberName(target) : "the counsellor"} for review.`,
        "success",
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't assign the client");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Assign ${client.first_name} ${client.last_name}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !toAdmin}>
            {busy ? "Sending…" : "Send to counsellor"}
          </Button>
        </>
      }
    >
      <form className={form.formGrid} onSubmit={submit}>
        {error && <div className={form.error}>{error}</div>}

        {assignable.length === 0 ? (
          <p className={form.empty}>
            No counsellors are available to take clients yet. Invite one from the Members tab.
          </p>
        ) : (
          <>
            <div className={form.field}>
              <label className={form.label} htmlFor="ac-member">
                Counsellor
              </label>
              <select
                id="ac-member"
                className={form.select}
                value={toAdmin}
                onChange={(e) => setToAdmin(e.target.value)}
              >
                {assignable.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                  </option>
                ))}
              </select>
            </div>

            <div className={form.field}>
              <label className={form.label} htmlFor="ac-rate">
                Session rate for this client (£)
              </label>
              <input
                id="ac-rate"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={form.input}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>

            <div className={form.field}>
              <label className={form.label} htmlFor="ac-avail">
                Availability
              </label>
              <textarea
                id="ac-avail"
                className={form.textarea}
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              />
            </div>

            <div className={form.field}>
              <label className={form.label} htmlFor="ac-intake">
                Intake notes for the counsellor
              </label>
              <textarea
                id="ac-intake"
                className={form.textarea}
                value={intake}
                onChange={(e) => setIntake(e.target.value)}
                placeholder="Presenting issue, risk flags, anything they should know before the first session."
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
