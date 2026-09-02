import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import type { AgencyFinanceSummary } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  addAgencyExpense,
  deleteAgencyExpense,
  fetchAgencyExpenses,
  selectAgency,
  selectAgencyExpenses,
  selectIsAgencyManager,
} from "@store/slices/agencySlice";

import { supabase } from "@/lib/supabase";
import styles from "../agency.module.scss";
import { formatPence, poundsToPence } from "../agencyFormat";

const RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export default function AgencyFinancePage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const expenses = useAppSelector(selectAgencyExpenses);

  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<AgencyFinanceSummary | null>(null);

  const [incurredOn, setIncurredOn] = useState(today());
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSummary = useCallback(async () => {
    const { data } = await supabase.rpc("agency_finance_summary", {
      p_from: isoDaysAgo(days),
      p_to: today(),
    });
    if (data) setSummary(data as AgencyFinanceSummary);
  }, [days]);

  useEffect(() => {
    dispatch(fetchAgencyExpenses());
  }, [dispatch]);

  useEffect(() => {
    if (isManager) loadSummary();
  }, [isManager, loadSummary]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const addExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!agency || !amount.trim()) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        addAgencyExpense({
          agency_id: agency.id,
          incurred_on: incurredOn,
          amount_pence: poundsToPence(amount) ?? 0,
          category: category.trim() || null,
          note: note.trim() || null,
        }),
      ).unwrap();
      setAmount("");
      setCategory("");
      setNote("");
      loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the expense");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Finance</h1>
          <p className={styles.subtitle}>Client payments across the agency, against what you record as outgoings.</p>
        </div>
        <select
          className={styles.select}
          style={{ width: "auto" }}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Income</p>
          <div className={styles.tileValue}>{summary ? formatPence(summary.income_pence) : "—"}</div>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Outgoings</p>
          <div className={styles.tileValue}>{summary ? formatPence(summary.outgoings_pence) : "—"}</div>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Net</p>
          <div className={styles.tileValue}>{summary ? formatPence(summary.net_pence) : "—"}</div>
        </div>
      </div>

      <h2 className={styles.title} style={{ fontSize: "1.1rem" }}>
        Outgoings
      </h2>

      <form className={styles.toolbar} onSubmit={addExpense} style={{ alignItems: "flex-end" }}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ex-date">
            Date
          </label>
          <input
            id="ex-date"
            type="date"
            className={styles.input}
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ex-cat">
            Category
          </label>
          <input
            id="ex-cat"
            className={styles.input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Rent, software…"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ex-amt">
            Amount (£)
          </label>
          <input
            id="ex-amt"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className={styles.input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className={`${styles.field} ${styles.grow}`}>
          <label className={styles.label} htmlFor="ex-note">
            Note
          </label>
          <input id="ex-note" className={styles.input} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || !amount.trim()}>
          Add
        </Button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {expenses.length === 0 ? (
        <p className={styles.empty}>No outgoings recorded for this agency yet.</p>
      ) : (
        <div className={styles.list}>
          {expenses.map((x) => (
            <div key={x.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  {formatPence(x.amount_pence)} {x.category && `· ${x.category}`}
                </span>
                <span className={styles.rowMeta}>
                  {x.incurred_on}
                  {x.note && ` · ${x.note}`}
                </span>
              </div>
              <div className={styles.rowActions}>
                <Button
                  size="sm"
                  variant="ghost-danger"
                  onClick={() => dispatch(deleteAgencyExpense(x.id)).then(() => loadSummary())}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
