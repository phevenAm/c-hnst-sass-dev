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
                Transfer the fee directly to the bank account below. Your session will be confirmed once payment is
                received.
              </p>

              <dl className={styles.details}>
                {bankDetails.bank_name && (
                  <>
                    <dt>Bank</dt>
                    <dd>{bankDetails.bank_name}</dd>
                  </>
                )}
                {bankDetails.bank_account_name && (
                  <>
                    <dt>Account name</dt>
                    <dd>{bankDetails.bank_account_name}</dd>
                  </>
                )}
                <dt>Sort code</dt>
                <dd className={styles.mono}>{formatSortCode(bankDetails.bank_sort_code!)}</dd>
                <dt>Account number</dt>
                <dd className={styles.mono}>{bankDetails.bank_account_number}</dd>
                <dt>Amount</dt>
                <dd className={styles.bold}>£{pricePounds}</dd>
                {bankDetails.bank_payment_reference && (
                  <>
                    <dt>Reference</dt>
                    <dd className={styles.mono}>{bankDetails.bank_payment_reference}</dd>
                  </>
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
              <p className={styles.intro}>
                Pay securely by card. A small processing fee is applied by the payment provider.
              </p>

              <dl className={styles.details}>
                <dt>Session fee</dt>
                <dd>£{pricePounds}</dd>
                <dt>Card processing</dt>
                <dd>~2%</dd>
              </dl>

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
