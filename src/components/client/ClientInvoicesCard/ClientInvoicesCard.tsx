import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { ChevronDownSmIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import { supabase } from "@/lib/supabase";
import { money } from "@/pages/admin/AdminInvoicesPage/invoiceMath";
import { useAppSelector } from "@/store/hooks";

import styles from "./ClientInvoicesCard.module.scss";

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

/** Human message from a functions.invoke() error (body is a Response on
 *  FunctionsHttpError). */
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

/**
 * The client's invoices, shown as a card on their dashboard — appears only when
 * the practice has invoicing on AND the client actually has one or more
 * (non-draft) invoices, so it doesn't clutter the dashboard otherwise.
 */
export default function ClientInvoicesCard() {
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const invoicesEnabled = useAppSelector((s) => s.practiceSettings.data?.invoices_enabled !== false);
  const cardPaymentsAvailable = useAppSelector(
    (s) => !!s.practiceSettings.data?.card_payments_enabled && !!s.practiceSettings.data?.stripe_connect_onboarded,
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const fetchInvoices = useCallback(async () => {
    if (!userProfile?.id || !invoicesEnabled) {
      setLoaded(true);
      return;
    }
    // RLS already limits this to the client's own non-draft invoices.
    const { data } = await supabase
      .from("invoices")
      .select("id, reference, status, issue_date, due_date, notes, total_pence, invoice_line_items(*)")
      .eq("client_id", userProfile.id)
      .neq("status", "draft")
      .order("issue_date", { ascending: false });
    setInvoices((data as Invoice[]) ?? []);
    setLoaded(true);
  }, [userProfile?.id, invoicesEnabled]);

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

  // Open the newest still-unpaid invoice by default so its "Pay by card" /
  // bank-transfer details are visible without a click.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loaded || autoOpenedRef.current || invoices.length === 0) return;
    autoOpenedRef.current = true;
    const firstDue = invoices.find((i) => i.status === "sent");
    if (firstDue) setOpenId(firstDue.id);
  }, [loaded, invoices]);

  // Arriving from the "new invoice" notification (url: /dashboard#invoices):
  // pull the card into view and pulse it, so it's obvious what needs action
  // even when the card is already on screen.
  const landedRef = useRef(false);
  useEffect(() => {
    if (!loaded || invoices.length === 0 || landedRef.current || location.hash !== "#invoices") return;
    landedRef.current = true;
    document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [loaded, invoices, location.hash]);

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

  // Nothing to show → render nothing (no empty card on the dashboard).
  if (!loaded || !invoicesEnabled || invoices.length === 0) return null;

  return (
    <Card
      id="invoices"
      className={`${styles.card} ${outstanding > 0 ? styles.attention : ""} ${flash ? styles.flash : ""}`}
    >
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Invoices from your counsellor</h3>
          {outstanding > 0 && <p className={styles.actionLine}>You have a payment to make</p>}
        </div>
        {outstanding > 0 && (
          <span className={styles.outstanding}>
            Outstanding <strong>{money(outstanding)}</strong>
          </span>
        )}
      </div>

      <ul className={styles.list}>
        {invoices.map((inv) => {
          const isOpen = openId === inv.id;
          const lines = [...inv.invoice_line_items].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <li key={inv.id} className={styles.item}>
              <button
                type="button"
                className={styles.rowBtn}
                onClick={() => setOpenId(isOpen ? null : inv.id)}
                aria-expanded={isOpen}
              >
                <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} aria-hidden="true">
                  <ChevronDownSmIcon />
                </span>
                <span className={styles.ref}>{inv.reference}</span>
                <span className={styles.date}>{dayjs(inv.issue_date).format("D MMM YYYY")}</span>
                <span className={styles.amount}>{money(inv.total_pence)}</span>
                <span className={`${styles.pill} ${styles[`pill_${inv.status}`]}`}>{STATUS_LABEL[inv.status]}</span>
              </button>

              {isOpen && (
                <div className={styles.detail}>
                  {inv.due_date && <p className={styles.meta}>Due by {dayjs(inv.due_date).format("D MMM YYYY")}</p>}
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
                      <span className={styles.payLabel}>How to pay</span>
                      {cardPaymentsAvailable && (
                        <Button size="sm" onClick={() => void handlePay(inv)} disabled={payingId === inv.id}>
                          {payingId === inv.id ? "Starting…" : `Pay ${money(inv.total_pence)} by card`}
                        </Button>
                      )}
                      <span className={styles.payHint}>
                        {cardPaymentsAvailable ? "Or by bank" : "Bank"} transfer — use the account details on your
                        emailed invoice and quote reference <strong>{inv.reference}</strong>.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
