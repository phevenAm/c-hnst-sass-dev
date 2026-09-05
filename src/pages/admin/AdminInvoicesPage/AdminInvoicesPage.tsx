import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { clientDisplayName } from "@Helpers/Helpers";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import StatTile from "@components/shared/StatTile/StatTile";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { RootState } from "@/store";

import { supabase } from "@/lib/supabase";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchClientStubs, selectAllStubs } from "@/store/slices/clientStubsSlice";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { fetchAllUsers, selectClientUsers } from "@/store/slices/userDirectorySlice";
import InvoiceModal from "./InvoiceModal";
import { money } from "./invoiceMath";
import { generateInvoicePdf, invoicePdfBase64 } from "./invoicePdf";

import styles from "./AdminInvoicesPage.module.scss";

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_amount_pence: number;
  session_id: string | null;
  sort_order: number;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type Invoice = {
  id: string;
  admin_id: string;
  client_id: string | null;
  stub_id: string | null;
  number: number;
  reference: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  total_pence: number;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  invoice_line_items: InvoiceLine[];
};

const STATUS_FILTERS: (InvoiceStatus | "all")[] = ["all", "draft", "sent", "paid", "void"];

type Props = {
  /** Rendered inside the Finances page rather than as its own route. */
  embedded?: boolean;
  /** Open the "new invoice" modal on mount (Finances overview action button). */
  openNew?: boolean;
};

export default function AdminInvoicesPage({ embedded = false, openNew = false }: Props) {
  const { userProfile, isDemo, practiceSettings } = useAuth();
  const { showToast } = useToast();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [filter, setFilter] = useState<InvoiceStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setEditing(null);
      setModalOpen(true);
      setSearchParams(
        (p) => {
          p.delete("new");
          return p;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (openNew) {
      setEditing(null);
      setModalOpen(true);
    }
  }, [openNew]);

  useFetchOnIdle((s: RootState) => s.userDirectory.status, fetchAllUsers, "Failed to load clients");
  useFetchOnIdle((s: RootState) => s.clientStubs.status, fetchClientStubs, "Failed to load offline clients");
  useFetchOnIdle((s: RootState) => s.practiceSettings.status, fetchPracticeSettings, "Failed to load settings");

  const clients = useAppSelector(selectClientUsers);
  const stubs = useAppSelector(selectAllStubs);
  const settings = useAppSelector((s: RootState) => s.practiceSettings.data);

  // Stubs merged into a real client keep appearing in `selectAllStubs`; every
  // other page filters them out of pickers so the same person isn't offered
  // twice (AdminClientsPage, AdminScheduler, AdminPaymentsPage all do this).
  const activeStubs = useMemo(() => stubs.filter((s) => !s.linked_user_id), [stubs]);

  const fetchInvoices = useCallback(async () => {
    if (!userProfile?.id) return;
    const { data, error } = await supabase
      .from("invoices")
      .select("*, invoice_line_items(*)")
      .eq("admin_id", userProfile.id)
      .order("issue_date", { ascending: false })
      .order("number", { ascending: false });
    if (error) showToast("Failed to load invoices", "error");
    else setInvoices((data as Invoice[]) ?? []);
    setLoading(false);
  }, [userProfile?.id, showToast]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  const clientName = useCallback(
    (inv: Invoice) => {
      if (inv.client_id) {
        const c = clients.find((u) => u.id === inv.client_id);
        return c ? clientDisplayName(c, useCodenames) : "Unknown client";
      }
      if (inv.stub_id) {
        const s = stubs.find((st) => st.id === inv.stub_id);
        if (!s) return "Offline client";
        return useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;
      }
      return "—";
    },
    [clients, stubs, useCodenames],
  );

  const setStatus = async (inv: Invoice, status: InvoiceStatus) => {
    if (isDemo) return showToast("Demo mode — changes are not saved.");
    setBusyId(inv.id);
    const patch: Record<string, unknown> = { status };
    if (status === "sent" && !inv.sent_at) patch.sent_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", inv.id);
    setBusyId(null);
    if (error) return showToast("Update failed", "error");
    showToast(`Marked ${status}.`);
    void fetchInvoices();
  };

  const markPaid = async (inv: Invoice) => {
    if (isDemo) return showToast("Demo mode — changes are not saved.");
    setBusyId(inv.id);
    const { error } = await supabase.rpc("mark_invoice_paid", { p_invoice_id: inv.id });
    setBusyId(null);
    if (error) return showToast("Couldn't mark paid", "error");
    showToast("Marked paid — added to your payments ledger.");
    void fetchInvoices();
  };

  const practiceDetails = () => ({
    businessName: settings?.business_name ?? null,
    bankName: settings?.bank_name ?? null,
    bankAccountName: settings?.bank_account_name ?? null,
    bankSortCode: settings?.bank_sort_code ?? null,
    bankAccountNumber: settings?.bank_account_number ?? null,
    bankReference: settings?.bank_payment_reference ?? null,
  });

  const sendEmail = async (inv: Invoice) => {
    if (isDemo) return showToast("Demo mode — email not sent.");
    if (!inv.client_id) {
      // No linked account to email — just move it to "sent".
      return setStatus(inv, "sent");
    }
    setBusyId(inv.id);
    // Render the PDF client-side (same path as the download button) and send it
    // as the attachment, so the emailed copy matches the downloaded one exactly.
    let pdf: { filename: string; base64: string } | null = null;
    try {
      pdf = await invoicePdfBase64(inv, inv.invoice_line_items ?? [], clientName(inv), practiceDetails());
    } catch (err) {
      console.error("Invoice PDF generation failed — sending without attachment", err);
    }
    const { error } = await supabase.functions.invoke("send-invoice-email", {
      body: { invoice_id: inv.id, pdf_base64: pdf?.base64, pdf_filename: pdf?.filename },
    });
    setBusyId(null);
    if (error) return showToast("Couldn't send the invoice email", "error");
    showToast("Invoice emailed to the client.");
    void fetchInvoices();
  };

  const downloadPdf = async (inv: Invoice) => {
    try {
      await generateInvoicePdf(inv, inv.invoice_line_items ?? [], clientName(inv), practiceDetails());
    } catch (err) {
      console.error("Invoice PDF generation failed", err);
      showToast("Couldn't generate the PDF — please try again", "error");
    }
  };

  const visible = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  const summary = useMemo(() => {
    const year = new Date().getFullYear();
    const outstanding = invoices
      .filter((i) => i.status === "draft" || i.status === "sent")
      .reduce((s, i) => s + i.total_pence, 0);
    const paidThisYear = invoices
      .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at).getFullYear() === year)
      .reduce((s, i) => s + i.total_pence, 0);
    return { outstanding, paidThisYear, year };
  }, [invoices]);

  if (loading) return null;

  return (
    <div className={embedded ? styles.contents : "page"}>
      <div className={embedded ? styles.contents : `inner ${styles.page}`}>
        <div className={styles.header}>
          {!embedded && (
            <div>
              <h1 className={styles.title}>Invoices</h1>
              <p className={styles.sub}>Raise invoices, send them, and mark them paid</p>
            </div>
          )}
          <SplitButton
            variant="primary"
            primaryLabel="New invoice"
            primaryAction={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            options={[]}
          />
        </div>

        <div className={styles.tiles}>
          <StatTile
            label="Awaiting payment"
            value={money(summary.outstanding)}
            sub="Invoices sent or drafted, not yet paid"
          />
          <StatTile
            label={`Paid in ${summary.year}`}
            value={money(summary.paidThisYear)}
            sub="Invoices marked paid this year"
          />
        </div>

        <div className={styles.filters}>
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

        {visible.length === 0 ? (
          <p className={styles.empty}>No invoices here yet.</p>
        ) : (
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => (
                  <tr key={inv.id}>
                    <td className={styles.refCell}>{inv.reference}</td>
                    <td className={styles.textCell}>{clientName(inv)}</td>
                    <td className={styles.dateCell}>{inv.issue_date}</td>
                    <td className={styles.dateCell}>{inv.due_date ?? "—"}</td>
                    <td className={styles.amountCell}>{money(inv.total_pence)}</td>
                    <td>
                      <span className={`${styles.pill} ${styles[`pill_${inv.status}`]}`}>{inv.status}</span>
                    </td>
                    <td>
                      <div
                        className={styles.actionsCell}
                        style={busyId === inv.id ? { opacity: 0.5, pointerEvents: "none" } : undefined}
                      >
                        {inv.status === "paid" || inv.status === "void" ? (
                          <Button size="sm" variant="ghost" onClick={() => void downloadPdf(inv)}>
                            PDF
                          </Button>
                        ) : (
                          <SplitButton
                            size="sm"
                            variant="secondary"
                            primaryLabel="Mark paid"
                            primaryAction={() => void markPaid(inv)}
                            options={[
                              {
                                label: "Edit",
                                onClick: () => {
                                  setEditing(inv);
                                  setModalOpen(true);
                                },
                              },
                              {
                                label: inv.status === "sent" ? "Resend email" : "Send email",
                                onClick: () => void sendEmail(inv),
                              },
                              { label: "Download PDF", onClick: () => void downloadPdf(inv) },
                              { label: "Void", onClick: () => void setStatus(inv, "void") },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {modalOpen && (
        <InvoiceModal
          initial={editing}
          adminId={userProfile?.id ?? ""}
          clients={clients}
          stubs={activeStubs}
          useCodenames={useCodenames}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchInvoices();
          }}
        />
      )}
    </div>
  );
}
