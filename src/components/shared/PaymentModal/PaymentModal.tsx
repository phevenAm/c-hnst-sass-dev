import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import { CopyIcon } from "@components/shared/Icons/Icons";
import Modal from "@components/shared/Modal/Modal";
import ToggleButtonTabs from "@components/shared/ToggleButtonTabs/ToggleButtonTabs";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase.js";
import type { Session } from "@/models/globalTypes";

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

function CopyRow({ label, value, mono, large }: { label: string; value: string; mono?: boolean; large?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>
        <button
          type="button"
          className={`${styles.copyBtn} ${mono ? styles.mono : ""} ${large ? styles.amountValue : ""}`}
          onClick={handleCopy}
          title="Click to copy"
        >
          {value}
          <span className={`${styles.copyIcon} ${copied ? styles.copyIconDone : ""}`}>
            {copied ? "✓" : <CopyIcon />}
          </span>
        </button>
      </dd>
    </div>
  );
}

const PaymentModal = ({ session, onClose }: PaymentModalProps) => {
  const { isDemo } = useAuth();
  const [tab, setTab] = useState<"bank" | "card">("bank");
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState("");

  const pricePounds = (session.price_pence / 100).toFixed(2);
  const cardTotalPounds = ((session.price_pence * 1.02) / 100).toFixed(2);

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
      if (fnError) {
        const msg: string = fnError.message ?? "";
        if (msg.toLowerCase().includes("not connected") || msg.includes("422")) {
          setError(
            "Card payment isn't available yet. Please pay by bank transfer or ask your therapist to connect their Stripe account.",
          );
        } else {
          setError(msg || "Something went wrong. Please try again.");
        }
        setIsRedirecting(false);
        return;
      }
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
            <ToggleButtonTabs
              leftButtonTitle="Bank transfer"
              rightButtonTitle="Pay with Stripe"
              leftButtonAction={() => setTab("bank")}
              rightButtonAction={() => setTab("card")}
              activeTab={tab === "bank" ? "left" : "right"}
              fullWidth
            />
          )}

          {tab === "bank" && hasBankDetails && bankDetails && (
            <div className={styles.panel}>
              <p className={styles.intro}>
                Transfer the fee directly to the bank account below. Click any value to copy it.
              </p>

              <dl className={styles.details}>
                {bankDetails.bank_name && (
                  <div className={styles.detailRow}>
                    <dt>Bank</dt>
                    <dd className={styles.plainDd}>{bankDetails.bank_name}</dd>
                  </div>
                )}
                {bankDetails.bank_account_name && (
                  <CopyRow label="Account name" value={bankDetails.bank_account_name} />
                )}
                <CopyRow label="Sort code" value={formatSortCode(bankDetails.bank_sort_code!)} mono />
                <CopyRow label="Account number" value={bankDetails.bank_account_number!} mono />
                <CopyRow label="Amount" value={`£${pricePounds}`} mono />
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
                <span className={styles.cardAmountValue}>£{cardTotalPounds}</span>
                <span className={styles.cardAmountFee}>
                  includes 2% Stripe processing fee (session fee £{pricePounds})
                </span>
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
                  {isRedirecting ? "Redirecting…" : `Pay £${cardTotalPounds} with Stripe`}
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
