import { useMemo, useState } from "react";

import dayjs from "dayjs";

import { clientDisplayName } from "@Helpers/Helpers";
import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import type { ClientStub, UserProfile } from "@/models/globalTypes";
import type { Invoice, InvoiceLine } from "./AdminInvoicesPage";
import { formatReference, lineTotalPence, money } from "./invoiceMath";

import styles from "./InvoiceModal.module.scss";

type DraftLine = {
  key: string;
  description: string;
  quantityStr: string;
  unitStr: string;
  session_id: string | null;
};

type Props = {
  initial: Invoice | null;
  adminId: string;
  clients: UserProfile[];
  stubs: ClientStub[];
  useCodenames: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const newKey = () => crypto.randomUUID();

const blankLine = (): DraftLine => ({
  key: newKey(),
  description: "",
  quantityStr: "1",
  unitStr: "",
  session_id: null,
});

const toDraftLine = (l: InvoiceLine): DraftLine => ({
  key: l.id,
  description: l.description,
  quantityStr: String(l.quantity),
  unitStr: (l.unit_amount_pence / 100).toFixed(2),
  session_id: l.session_id,
});

const initialClientValue = (initial: Invoice | null): string => {
  if (initial?.client_id) return `user:${initial.client_id}`;
  if (initial?.stub_id) return `stub:${initial.stub_id}`;
  return "";
};

const draftUnitPence = (l: DraftLine) => Math.round((parseFloat(l.unitStr || "0") || 0) * 100);
const draftQty = (l: DraftLine) => parseFloat(l.quantityStr || "0") || 0;
const linePence = (l: DraftLine) => lineTotalPence({ quantity: draftQty(l), unit_amount_pence: draftUnitPence(l) });

type SessionRow = { id: string; scheduled_at: string; price_pence: number };

export default function InvoiceModal({ initial, adminId, clients, stubs, useCodenames, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { isDemo } = useAuth();
  const [saving, setSaving] = useState(false);

  const [clientValue, setClientValue] = useState(initialClientValue(initial));
  const [issueDate, setIssueDate] = useState(initial?.issue_date ?? new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    initial && initial.invoice_line_items.length > 0
      ? [...initial.invoice_line_items].sort((a, b) => a.sort_order - b.sort_order).map(toDraftLine)
      : [blankLine()],
  );

  const [sessionPicker, setSessionPicker] = useState<SessionRow[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const isRealClient = clientValue.startsWith("user:");
  const clientId = isRealClient ? clientValue.slice(5) : null;

  const total = useMemo(() => lines.reduce((sum, l) => sum + linePence(l), 0), [lines]);

  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));

  const loadSessions = async () => {
    if (!clientId) return;
    setLoadingSessions(true);
    const { data, error } = await supabase
      .from("sessions")
      .select("id, scheduled_at, price_pence")
      .eq("client_id", clientId)
      .neq("status", "cancelled")
      .gt("price_pence", 0)
      .order("scheduled_at", { ascending: false })
      .limit(30);
    setLoadingSessions(false);
    if (error) {
      showToast("Couldn't load sessions", "error");
      return;
    }
    const alreadyAdded = new Set(lines.map((l) => l.session_id).filter(Boolean));
    setSessionPicker((data ?? []).filter((s) => !alreadyAdded.has(s.id)));
  };

  const addSessionLine = (s: SessionRow) => {
    setLines((prev) => [
      ...prev.filter((l) => !(l.description === "" && l.unitStr === "" && l.session_id === null)),
      {
        key: newKey(),
        description: `Session — ${dayjs(s.scheduled_at).format("D MMM YYYY")}`,
        quantityStr: "1",
        unitStr: (s.price_pence / 100).toFixed(2),
        session_id: s.id,
      },
    ]);
    setSessionPicker((prev) => prev?.filter((row) => row.id !== s.id) ?? null);
  };

  const handleSave = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }
    if (!issueDate) {
      showToast("Issue date is required", "error");
      return;
    }
    const cleanLines = lines
      .map((l, i) => ({
        description: l.description.trim(),
        quantity: draftQty(l),
        unit_amount_pence: draftUnitPence(l),
        session_id: l.session_id,
        sort_order: i,
      }))
      .filter((l) => l.quantity > 0 && l.unit_amount_pence > 0);

    if (cleanLines.length === 0) {
      showToast("Add at least one line with an amount", "error");
      return;
    }

    setSaving(true);
    const stubId = clientValue.startsWith("stub:") ? clientValue.slice(5) : null;

    try {
      let invoiceId = initial?.id;

      if (initial) {
        const { error: upErr } = await supabase
          .from("invoices")
          .update({
            client_id: clientId,
            stub_id: stubId,
            issue_date: issueDate,
            due_date: dueDate || null,
            notes: notes.trim() || null,
          })
          .eq("id", initial.id);
        if (upErr) throw upErr;
        const { error: delErr } = await supabase.from("invoice_line_items").delete().eq("invoice_id", initial.id);
        if (delErr) throw delErr;
      } else {
        const [{ data: settings }, { data: num, error: numErr }] = await Promise.all([
          supabase.from("practice_settings").select("invoice_prefix").eq("admin_id", adminId).maybeSingle(),
          supabase.rpc("allocate_invoice_number"),
        ]);
        if (numErr) throw numErr;
        const prefix = settings?.invoice_prefix ?? "INV-";
        const number = num as number;
        const reference = formatReference(prefix, number);

        const { data: inserted, error: insErr } = await supabase
          .from("invoices")
          .insert({
            admin_id: adminId,
            client_id: clientId,
            stub_id: stubId,
            number,
            reference,
            status: "draft",
            issue_date: issueDate,
            due_date: dueDate || null,
            notes: notes.trim() || null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        invoiceId = inserted.id;
      }

      const { error: linesErr } = await supabase
        .from("invoice_line_items")
        .insert(cleanLines.map((l) => ({ ...l, invoice_id: invoiceId })));
      if (linesErr) throw linesErr;

      showToast(initial ? "Invoice updated." : "Invoice created.");
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save invoice", "error");
    } finally {
      setSaving(false);
    }
  };

  const stubName = (s: ClientStub) =>
    useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;

  let saveLabel = "Create invoice";
  if (saving) saveLabel = "Saving…";
  else if (initial) saveLabel = "Save changes";

  return (
    <Modal
      title={initial ? `Edit ${initial.reference}` : "New invoice"}
      size="lg"
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
            <label htmlFor="inv-client">Client</label>
            <select
              id="inv-client"
              value={clientValue}
              onChange={(e) => {
                setClientValue(e.target.value);
                setSessionPicker(null);
              }}
            >
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
            <label>Issue date</label>
            <DateInput
              mode="date"
              value={issueDate ? dayjs(issueDate) : null}
              onChange={(v) => setIssueDate(v?.format("YYYY-MM-DD") ?? "")}
            />
          </div>
          <div className={styles.field}>
            <label>Due date</label>
            <DateInput
              mode="date"
              value={dueDate ? dayjs(dueDate) : null}
              onChange={(v) => setDueDate(v?.format("YYYY-MM-DD") ?? "")}
            />
          </div>
        </div>

        <div className={styles.linesHeader}>
          <span className={styles.sectionLabel}>Line items</span>
          {isRealClient &&
            (sessionPicker === null ? (
              <button type="button" className={styles.textBtn} onClick={loadSessions} disabled={loadingSessions}>
                {loadingSessions ? "Loading…" : "Add from sessions"}
              </button>
            ) : (
              <button type="button" className={styles.textBtn} onClick={() => setSessionPicker(null)}>
                Hide sessions
              </button>
            ))}
        </div>

        {sessionPicker !== null && (
          <div className={styles.sessionPicker}>
            {sessionPicker.length === 0 ? (
              <p className={styles.muted}>No priced sessions left to add.</p>
            ) : (
              sessionPicker.map((s) => (
                <button key={s.id} type="button" className={styles.sessionRow} onClick={() => addSessionLine(s)}>
                  <span>{dayjs(s.scheduled_at).format("ddd D MMM YYYY")}</span>
                  <span>
                    {money(s.price_pence)} <span aria-hidden>＋</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className={styles.lines}>
          {lines.map((l) => (
            <div key={l.key} className={styles.lineItem}>
              <input
                className={styles.lineDesc}
                type="text"
                placeholder="Description"
                value={l.description}
                onChange={(e) => updateLine(l.key, { description: e.target.value })}
              />
              <input
                className={styles.lineQty}
                type="number"
                min="0"
                step="1"
                aria-label="Quantity"
                value={l.quantityStr}
                onChange={(e) => updateLine(l.key, { quantityStr: e.target.value })}
              />
              <input
                className={styles.lineUnit}
                type="number"
                min="0"
                step="0.01"
                aria-label="Unit amount (£)"
                placeholder="0.00"
                value={l.unitStr}
                onChange={(e) => updateLine(l.key, { unitStr: e.target.value })}
              />
              <span className={styles.lineTotal}>{money(linePence(l))}</span>
              <button
                type="button"
                className={styles.removeLine}
                aria-label="Remove line"
                onClick={() => removeLine(l.key)}
                disabled={lines.length === 1}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" className={styles.textBtn} onClick={() => setLines((p) => [...p, blankLine()])}>
          ＋ Add line
        </button>

        <div className={styles.grandTotal}>
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>

        <div className={styles.field}>
          <label htmlFor="inv-notes">
            Notes <span className={styles.optional}>(shown on the invoice)</span>
          </label>
          <textarea
            id="inv-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Payment due within 14 days."
          />
        </div>
      </div>
    </Modal>
  );
}
