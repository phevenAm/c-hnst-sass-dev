import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import { money } from "@/pages/admin/AdminInvoicesPage/invoiceMath";
import { useAppSelector } from "@/store/hooks";

import styles from "./ClientInvoicesPage.module.scss";

type Line = {
  id: string;
  description: string;
  quantity: number;
  unit_amount_pence: number;
  sort_order: number;
};

type Invoice = {
  id: string;
  reference: string;
  status: "sent" | "paid" | "void";
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  total_pence: number;
  invoice_line_items: Line[];
};

const STATUS_LABEL: Record<Invoice["status"], string> = {
  sent: "Awaiting payment",
  paid: "Paid",
  void: "Cancelled",
};

/** Pull the human message out of a functions.invoke() error (its body is a
 *  Response on FunctionsHttpError). */
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* not JSON */
    }
  }
  return fallback;
}

export default function ClientInvoicesPage() {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // useAuth().practiceSettings is admin-only; the shared slice cache is
  // populated for clients too (their own practice's row, via RLS).
  const invoicesEnabled = useAppSelector((s) => s.practiceSettings.data?.invoices_enabled !== false);
  const cardPaymentsAvailable = useAppSelector(
    (s) => !!s.practiceSettings.data?.card_payments_enabled && !!s.practiceSettings.data?.stripe_connect_onboarded,
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!userProfile?.id) return;
    // RLS already limits this to the client's own non-draft invoices; the
    // filters just keep the intent obvious.
    const { data, error } = await supabase
      .from("invoices")
      .select("id, reference, status, issue_date, due_date, notes, total_pence, invoice_line_items(*)")
      .eq("client_id", userProfile.id)
      .neq("status", "draft")
      .order("issue_date", { ascending: false });
    if (error) showToast("Couldn't load your invoices", "error");
    else setInvoices((data as Invoice[]) ?? []);
    setLoading(false);
  }, [userProfile?.id, showToast]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  // Coming back from Stripe Checkout.
  useEffect(() => {
    const outcome = searchParams.get("payment");
    if (!outcome) return;
    if (outcome === "success") {
      showToast("Payment received — thank you.");
      void fetchInvoices();
    } else if (outcome === "cancelled") {
      showToast("Payment cancelled — nothing was charged.");
    }
    setSearchParams(
      (p) => {
        p.delete("payment");
        return p;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, showToast, fetchInvoices]);

  const outstanding = useMemo(
    () => invoices.filter((i) => i.status === "sent").reduce((s, i) => s + i.total_pence, 0),
    [invoices],
  );

  const handlePay = async (inv: Invoice) => {
    if (isDemo) {
      showToast("Demo mode — no real payment is taken.");
      return;
    }
    setPayingId(inv.id);
    const { data, error } = await supabase.functions.invoke("create-invoice-checkout", {
      body: { invoice_id: inv.id },
    });
    if (error || !data?.url) {
      setPayingId(null);
      showToast(await invokeErrorMessage(error, "Couldn't start the payment — try again."), "error");
      return;
    }
    window.location.href = data.url as string;
  };

  // The practice can turn invoicing off entirely — mirror the admin gating.
  if (!invoicesEnabled) {
    return (
      <div className="page">
        <div className="inner">
          <p className={styles.empty}>Invoices aren't available for your account.</p>
        </div>
      </div>
    );
  }

  if (loading) return null;

  return (
    <div className="page">
      <div className="inner">
        <h1 className={styles.title}>Invoices</h1>
        <p className={styles.sub}>Invoices your counsellor has sent you. A PDF copy of each was also emailed to you.</p>

        {isDemo && <p className={styles.sub}>Demo mode — these are sample figures.</p>}

        {invoices.length === 0 ? (
          <p className={styles.empty}>You don't have any invoices yet.</p>
        ) : (
          <>
            {outstanding > 0 && (
              <p className={styles.outstanding}>
                Outstanding: <strong>{money(outstanding)}</strong>
              </p>
            )}
            <ul className={styles.list}>
              {invoices.map((inv) => {
                const isOpen = openId === inv.id;
                const lines = [...inv.invoice_line_items].sort((a, b) => a.sort_order - b.sort_order);
                return (
                  <li key={inv.id}>
                    <Card className={styles.card}>
                      <button
                        type="button"
                        className={styles.rowBtn}
                        onClick={() => setOpenId(isOpen ? null : inv.id)}
                        aria-expanded={isOpen}
                      >
                        <span className={styles.ref}>{inv.reference}</span>
                        <span className={styles.date}>{dayjs(inv.issue_date).format("D MMM YYYY")}</span>
                        <span className={styles.amount}>{money(inv.total_pence)}</span>
                        <span className={`${styles.pill} ${styles[`pill_${inv.status}`]}`}>
                          {STATUS_LABEL[inv.status]}
                        </span>
                      </button>

                      {isOpen && (
                        <div className={styles.detail}>
                          {inv.due_date && (
                            <p className={styles.meta}>Due by {dayjs(inv.due_date).format("D MMM YYYY")}</p>
                          )}
                          <table className={styles.lineTable}>
                            <tbody>
                              {lines.map((l) => (
                                <tr key={l.id}>
                                  <td>{l.description || "—"}</td>
                                  <td className={styles.num}>
                                    {l.quantity} × {money(l.unit_amount_pence)}
                                  </td>
                                  <td className={styles.num}>{money(Math.round(l.quantity * l.unit_amount_pence))}</td>
                                </tr>
                              ))}
                              <tr className={styles.totalRow}>
                                <td>Total</td>
                                <td />
                                <td className={styles.num}>{money(inv.total_pence)}</td>
                              </tr>
                            </tbody>
                          </table>
                          {inv.notes && <p className={styles.notes}>{inv.notes}</p>}

                          {inv.status === "sent" && (
                            <div className={styles.payRow}>
                              {cardPaymentsAvailable && (
                                <Button size="sm" onClick={() => void handlePay(inv)} disabled={payingId === inv.id}>
                                  {payingId === inv.id ? "Starting…" : `Pay ${money(inv.total_pence)} by card`}
                                </Button>
                              )}
                              <span className={styles.payHint}>
                                Or pay by bank transfer using the details on your emailed invoice — quote the reference{" "}
                                {inv.reference}.
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
