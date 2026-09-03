import { useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import type { Expense } from "./AdminExpensesPage";

import styles from "./ExpenseModal.module.scss";

type Props = {
  initial: Expense | null;
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
};

// Suggested categories only — the field is free text, so a practice can type
// its own. Deliberately not tax-return categories.
export const EXPENSE_CATEGORIES = [
  "Room hire",
  "Travel",
  "Training / CPD",
  "Supervision",
  "Insurance",
  "Software",
  "Equipment",
  "Marketing",
  "Accountancy",
  "Memberships",
  "Other",
];

export default function ExpenseModal({ initial, adminId, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { isDemo } = useAuth();
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(initial?.incurred_on ?? new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState(initial?.category ?? "Room hire");
  const [amountStr, setAmountStr] = useState(initial ? (initial.amount_pence / 100).toFixed(2) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [receiptUrl, setReceiptUrl] = useState(initial?.receipt_url ?? "");

  const handleSave = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }
    if (!date) {
      showToast("Date is required", "error");
      return;
    }
    const amountPence = Math.round(parseFloat(amountStr || "0") * 100);
    if (!Number.isFinite(amountPence) || amountPence <= 0) {
      showToast("Enter an amount greater than zero", "error");
      return;
    }

    setSaving(true);
    const payload = {
      admin_id: adminId,
      incurred_on: date,
      category: category.trim() || "Other",
      amount_pence: amountPence,
      description: description.trim() || null,
      receipt_url: receiptUrl || null,
    };

    const { error } = initial
      ? await supabase.from("expenses").update(payload).eq("id", initial.id)
      : await supabase.from("expenses").insert(payload);

    setSaving(false);
    if (error) {
      showToast("Failed to save expense", "error");
      return;
    }
    showToast(initial ? "Expense updated." : "Expense added.");
    onSaved();
  };

  let saveLabel = "Add expense";
  if (saving) saveLabel = "Saving…";
  else if (initial) saveLabel = "Save changes";

  return (
    <Modal
      title={initial ? "Edit expense" : "Add expense"}
      size="sm"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Date</label>
            <DateInput
              mode="date"
              value={date ? dayjs(date) : null}
              onChange={(val) => setDate(val?.format("YYYY-MM-DD") ?? "")}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="exp-amount">Amount (£)</label>
            <input
              id="exp-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="exp-category">Category</label>
          <input
            id="exp-category"
            type="text"
            list="exp-category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="exp-category-options">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className={styles.field}>
          <label htmlFor="exp-desc">
            Description <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="exp-desc"
            type="text"
            placeholder="e.g. Weekly room hire — September"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>
            Receipt <span className={styles.optional}>(optional PDF)</span>
          </label>
          <PdfUpload adminId={adminId} value={receiptUrl} onChange={setReceiptUrl} />
        </div>
      </div>
    </Modal>
  );
}
