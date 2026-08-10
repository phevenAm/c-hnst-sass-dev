import { useState } from "react";

import { Button } from "@/components/shared";
import Modal from "@/components/shared/Modal/Modal";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { clientDisplayName } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase";
import type { ClientStub, UserProfile } from "@/models/globalTypes";
import type { ManualPayment } from "../AdminPaymentsPage";

import styles from "./AddPaymentModal.module.scss";

interface Props {
  clients: UserProfile[];
  stubs: ClientStub[];
  useCodenames: boolean;
  onClose: () => void;
  onSaved: (payment: ManualPayment) => void;
}

export default function AddPaymentModal({ clients, stubs, useCodenames, onClose, onSaved }: Props) {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();

  const [clientValue, setClientValue] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stubName = (s: ClientStub) =>
    useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;

  const handleSave = async () => {
    if (!userProfile?.id) return;
    if (isDemo) {
      showToast("Demo mode — changes are not saved.", "warning");
      return;
    }

    const amountPence = Math.round(parseFloat(amountStr || "0") * 100);
    if (amountPence <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    setSaving(true);
    setError("");

    const isStub = clientValue.startsWith("stub:");
    const linkedId = clientValue.replace(/^(user:|stub:)/, "") || null;

    const { data, error: dbError } = await supabase
      .from("payments")
      .insert({
        admin_id: userProfile.id,
        client_id: isStub ? null : linkedId,
        stub_id: isStub ? linkedId : null,
        amount_pence: amountPence,
        description: description.trim() || null,
        paid_at: new Date(paidAt).toISOString(),
      })
      .select()
      .single();

    setSaving(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    showToast("Payment recorded.");
    onSaved(data as ManualPayment);
  };

  return (
    <Modal
      title="Record payment"
      size="sm"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="pay-client">Client (optional)</label>
          <select id="pay-client" value={clientValue} onChange={(e) => setClientValue(e.target.value)}>
            <option value="">No client / general</option>
            {clients.map((c) => (
              <option key={c.id} value={`user:${c.id}`}>
                {clientDisplayName(c, useCodenames)}
              </option>
            ))}
            {stubs.length > 0 && (
              <optgroup label="Offline clients">
                {stubs.map((s) => (
                  <option key={s.id} value={`stub:${s.id}`}>
                    {stubName(s)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="pay-amount">Amount (£)</label>
          <input
            id="pay-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="85.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="pay-date">Date received</label>
          <input id="pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label htmlFor="pay-desc">Description (optional)</label>
          <input
            id="pay-desc"
            type="text"
            placeholder="e.g. Cash payment, session 4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
