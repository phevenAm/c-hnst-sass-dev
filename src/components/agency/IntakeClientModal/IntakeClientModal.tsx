import { type FormEvent, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import form from "@pages/agency/agency.module.scss";
import { poundsToPence } from "@pages/agency/agencyFormat";
import { useAppDispatch } from "@store/hooks";
import { createIntakeClient } from "@store/slices/agencySlice";

// Manager captures a new client's intake. Creates an offline record in the
// agency pool; a counsellor is attached later via "Assign".
export default function IntakeClientModal({ agencyId, onClose }: { agencyId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [rate, setRate] = useState("");
  const [availability, setAvailability] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        createIntakeClient({
          agency_id: agencyId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          default_rate_pence: rate.trim() ? poundsToPence(rate) : null,
          availability_note: availability.trim() || null,
        }),
      ).unwrap();
      showToast("Client added to the pool.", "success");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the client");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add a client"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !firstName.trim() || !lastName.trim()}>
            {busy ? "Adding…" : "Add client"}
          </Button>
        </>
      }
    >
      <form className={form.formGrid} onSubmit={submit}>
        {error && <div className={form.error}>{error}</div>}

        <div className={form.rowInline}>
          <div className={form.field}>
            <label className={form.label} htmlFor="ic-first">
              First name
            </label>
            <input
              id="ic-first"
              className={form.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className={form.field}>
            <label className={form.label} htmlFor="ic-last">
              Last name
            </label>
            <input
              id="ic-last"
              className={form.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="ic-email">
            Email (optional)
          </label>
          <input
            id="ic-email"
            type="email"
            className={form.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="ic-rate">
            Default session rate (£, optional)
          </label>
          <input
            id="ic-rate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className={form.input}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 60"
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="ic-avail">
            Availability notes (optional)
          </label>
          <textarea
            id="ic-avail"
            className={form.textarea}
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            placeholder="e.g. Weekday evenings, or Tuesday/Thursday mornings."
          />
        </div>
      </form>
    </Modal>
  );
}
