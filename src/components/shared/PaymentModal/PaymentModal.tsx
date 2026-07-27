import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase.js";
import type { Session, SessionBlockMeta } from "@/models/globalTypes";

import styles from "./PaymentModal.module.scss";

type BankDetails = {
  bank_name: string | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  bank_payment_reference: string | null;
};

type PaymentModalProps = {
  session: Session;
  onClose: () => void;
};

function formatSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 6 ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}` : raw;
}

function CopyRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <dt>{label}</dt>
      <dd>
        <button
          type="button"
          className={`${styles.copyBtn} ${mono ? styles.mono : ""} ${bold ? styles.bold : ""}`}
          onClick={handleCopy}
          title="Click to copy"
        >
          {value}
          <span className={`${styles.copyIcon} ${copied ? styles.copyIconDone : ""}`}>
            {copied ? (
              "✓"
            ) : (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </span>
        </button>
      </dd>
    </>
  );
}

const PaymentModal = ({ session, onClose }: PaymentModalProps) => {
  const { isDemo } = useAuth();
  const [tab, setTab] = useState<"bank" | "card">("bank");
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState("");

  const meta = session.metadata as SessionBlockMeta | null;
  const isBlock = !!meta?.block_id;
  const pricePounds = (session.price_pence / 100).toFixed(2);

  useEffect(() => {
    if (!session.created_by) {
      setTab("card");
      setLoadingDetails(false);
      return;
    }
    supabase
      .from("practice_settings")
      .select("bank_name, bank_account_name, bank_sort_code, bank_account_number, bank_payment_reference")
      .eq("admin_id", session.created_by)
      .single()
      .then(({ data }) => {
        setBankDetails(data as BankDetails | null);
        if (!data?.bank_account_number) setTab("card");
        setLoadingDetails(false);
      });
  }, [session.created_by]);

  const hasBankDetails = !!(bankDetails?.bank_account_number && bankDetails?.bank_sort_code);

  const handleStripePayment = async () => {
    if (isDemo) return;
    setIsRedirecting(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-checkout-session", {
        body: { session_id: session.id },
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setIsRedirecting(false);
    }
  };

  return (
    <Modal title="Pay for session" onClose={onClose} size="sm">
      {loadingDetails ? (
        <p className={styles.loading}>Loading payment options…</p>
      ) : (
        <>
          {hasBankDetails && (
            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "bank"}
                className={`${styles.tab} ${tab === "bank" ? styles.tabActive : ""}`}
                onClick={() => setTab("bank")}
              >
                Bank transfer
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "card"}
                className={`${styles.tab} ${tab === "card" ? styles.tabActive : ""}`}
                onClick={() => setTab("card")}
              >
                Pay by card
              </button>
            </div>
          )}

          {tab === "bank" && hasBankDetails && bankDetails && (
            <div className={styles.panel}>
              <p className={styles.intro}>
                Transfer the fee directly to the bank account below. Click any value to copy it.
              </p>

              <dl className={styles.details}>
                {bankDetails.bank_name && (
                  <>
                    <dt>Bank</dt>
                    <dd className={styles.plainDd}>{bankDetails.bank_name}</dd>
                  </>
                )}
                {bankDetails.bank_account_name && (
                  <CopyRow label="Account name" value={bankDetails.bank_account_name} />
                )}
                <CopyRow label="Sort code" value={formatSortCode(bankDetails.bank_sort_code!)} mono />
                <CopyRow label="Account number" value={bankDetails.bank_account_number!} mono />
                <CopyRow label="Amount" value={`£${pricePounds}`} bold />
                {bankDetails.bank_payment_reference && (
                  <CopyRow label="Reference" value={bankDetails.bank_payment_reference} mono />
                )}
              </dl>

              <p className={styles.note}>
                Once you've sent the transfer your therapist will mark the session as paid. Please use your full name in
                the reference if one isn't shown above.
              </p>

              <div className={styles.actions}>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {tab === "card" && (
            <div className={styles.panel}>
              <p className={styles.intro}>Pay securely by card through Stripe.</p>

              <div className={styles.cardAmount}>
                <span className={styles.cardAmountValue}>£{pricePounds}</span>
                <span className={styles.cardAmountFee}>+ ~2% card processing fee</span>
              </div>

              {hasBankDetails && (
                <p className={styles.note}>
                  Bank transfer avoids this fee and sends the full amount directly to your therapist.
                </p>
              )}

              {import.meta.env.DEV && (
                <div className={styles.testCard}>
                  <strong>Test card</strong>
                  <code>4242 4242 4242 4242</code> · Expiry <code>12/30</code> · CVC <code>123</code>
                </div>
              )}

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.actions}>
                <Button variant="ghost" onClick={onClose} disabled={isRedirecting}>
                  Cancel
                </Button>
                <Button onClick={handleStripePayment} disabled={isRedirecting || isDemo}>
                  {isRedirecting ? "Redirecting…" : `Pay £${isBlock ? "block" : pricePounds} by card`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default PaymentModal;
