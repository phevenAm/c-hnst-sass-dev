import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import AgencyInvoiceModal from "@components/agency/AgencyInvoiceModal/AgencyInvoiceModal";
import Button from "@components/shared/Button/Button";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useToast } from "@context/ToastContext";
import type { AgencyInvoice, AgencyInvoiceStatus, AgencyMemberWithUser } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  deleteAgencyInvoice,
  fetchAgencyInvoices,
  fetchAgencyMembers,
  markAgencyInvoicePaid,
  selectAgency,
  selectAgencyInvoices,
  selectAgencyMembers,
  selectIsAgencyManager,
  updateAgencyInvoiceStatus,
} from "@store/slices/agencySlice";

import styles from "../agency.module.scss";
import { formatPence } from "../agencyFormat";

const STATUS_FILTERS: (AgencyInvoiceStatus | "all")[] = ["all", "draft", "sent", "due", "paid", "overdue", "cancelled"];

const memberName = (m: AgencyMemberWithUser | undefined) =>
  m ? m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member" : "Former staff";

export default function AgencyInvoicesPage() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const invoices = useAppSelector(selectAgencyInvoices);
  const members = useAppSelector(selectAgencyMembers);
  const status = useAppSelector((s) => s.agency.invoicesStatus);

  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<AgencyInvoiceStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchAgencyInvoices());
    dispatch(fetchAgencyMembers());
  }, [dispatch]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const visible = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  const summary = useMemo(() => {
    const outstanding = invoices
      .filter((i) => i.status === "draft" || i.status === "sent" || i.status === "due")
      .reduce((s, i) => s + i.amount_pence, 0);
    const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount_pence, 0);
    const year = new Date().getFullYear();
    const paidThisYear = invoices
      .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at).getFullYear() === year)
      .reduce((s, i) => s + i.amount_pence, 0);
    return { outstanding, overdue, paidThisYear, year };
  }, [invoices]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const activeMembers = members.filter((m) => m.status === "active");

  const setStatus = async (inv: AgencyInvoice, next: AgencyInvoiceStatus) => {
    setBusyId(inv.id);
    try {
      if (next === "paid") await dispatch(markAgencyInvoicePaid(inv.id)).unwrap();
      else await dispatch(updateAgencyInvoiceStatus({ id: inv.id, status: next })).unwrap();
      showToast(`Marked ${next}.`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't update the invoice", "danger");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (inv: AgencyInvoice) => {
    setBusyId(inv.id);
    try {
      await dispatch(deleteAgencyInvoice(inv.id)).unwrap();
      showToast("Invoice deleted.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't delete the invoice", "danger");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>
            What staff owe the agency — seat fees, referrals, anything you bill them for.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)} disabled={activeMembers.length === 0}>
          New invoice
        </Button>
      </div>

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Outstanding</p>
          <div className={styles.tileValue}>{formatPence(summary.outstanding)}</div>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Overdue</p>
          <div className={styles.tileValue}>{formatPence(summary.overdue)}</div>
        </div>
        <div className={styles.tile}>
          <p className={styles.tileLabel}>Paid in {summary.year}</p>
          <div className={styles.tileValue}>{formatPence(summary.paidThisYear)}</div>
        </div>
      </div>

      <div className={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {status === "loading" && visible.length === 0 && <p className={styles.empty}>Loading invoices…</p>}
      {status !== "loading" && visible.length === 0 && (
        <p className={styles.empty}>
          {activeMembers.length === 0
            ? "Invite a staff member before you can raise an invoice."
            : "No invoices here yet."}
        </p>
      )}

      {visible.length > 0 && (
        <div className={styles.list}>
          {visible.map((inv) => (
            <div key={inv.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  {inv.reference} · {memberName(memberById.get(inv.staff_user_id ?? ""))}
                </span>
                <span className={styles.rowMeta}>
                  {formatPence(inv.amount_pence)} · Issued {inv.issue_date}
                  {inv.due_date && ` · Due ${inv.due_date}`}
                  {inv.description && ` · ${inv.description}`}
                </span>
              </div>
              <div
                className={styles.rowActions}
                style={busyId === inv.id ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              >
                <span className={styles.pill}>{inv.status}</span>
                {inv.status === "paid" || inv.status === "cancelled" ? null : (
                  <SplitButton
                    size="sm"
                    variant="secondary"
                    primaryLabel="Mark paid"
                    primaryAction={() => setStatus(inv, "paid")}
                    options={[
                      ...(inv.status === "draft"
                        ? [{ label: "Mark sent", onClick: () => setStatus(inv, "sent") }]
                        : []),
                      ...(inv.status !== "due" ? [{ label: "Mark due", onClick: () => setStatus(inv, "due") }] : []),
                      ...(inv.status !== "overdue"
                        ? [{ label: "Mark overdue", onClick: () => setStatus(inv, "overdue") }]
                        : []),
                      { label: "Cancel invoice", onClick: () => setStatus(inv, "cancelled") },
                      { label: "Delete", onClick: () => remove(inv) },
                    ]}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && agency && (
        <AgencyInvoiceModal agencyId={agency.id} members={activeMembers} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
