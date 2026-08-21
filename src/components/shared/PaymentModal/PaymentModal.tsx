import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import { CopyIcon } from "@components/shared/Icons/Icons";
import Modal from "@components/shared/Modal/Modal";
import ToggleButtonTabs from "@components/shared/ToggleButtonTabs/ToggleButtonTabs";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import type { Session, SessionBlockMeta } from "@/models/globalTypes";
import { useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";

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
  const { showToast } = useToast();
  const [tab, setTab] = useState<"bank" | "card">("bank");
  const [blockTotalLoading, setBlockTotalLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [manualPaymentStatus, setManualPaymentStatus] = useState(session.manual_payment_status ?? "none");
  const [markingAsPaid, setMarkingAsPaid] = useState(false);
  const [blockTotalPence, setBlockTotalPence] = useState<number | null>(null);
  const [blockSessionCount, setBlockSessionCount] = useState(0);

  const meta = session.metadata as SessionBlockMeta | null;
  const isBlock = !!meta?.block_id;

  const handleRequestManualPayment = async () => {
    if (isDemo) return;
    setMarkingAsPaid(true);
    const { error: rpcError } = await supabase.rpc("request_manual_payment", { p_session_id: session.id });
    setMarkingAsPaid(false);
    if (rpcError) {
      showToast("Couldn't mark this as paid — please try again.", "error");
      return;
    }
    setManualPaymentStatus("pending");
    supabase.functions.invoke("notify-client-payment-claimed", { body: { session_id: session.id } });
    showToast("Marked as paid. Your therapist will confirm shortly.");
  };

  // For a block session, the client pays the block total in one go (matches
  // the Stripe checkout + manual-payment RPCs, which both settle the whole
  // block together) — not this one session's price.
  const totalPricePence = isBlock && blockTotalPence !== null ? blockTotalPence : session.price_pence;
  const pricePounds = (totalPricePence / 100).toFixed(2);
  // const cardTotalPounds = ((totalPricePence * 1.02) / 100).toFixed(2);
  const cardTotalPounds = pricePounds;

  // Shared cache (practiceSettingsSlice) — same row every other consumer
  // (Navbar, InterfacePrefsContext, etc.) reads, instead of this modal firing
  // its own independent practice_settings fetch every time it opens. RLS
  // scopes the row to "your own admin" for a client caller, so no explicit
  // admin_id filter is needed here.
  useFetchOnIdle((state) => state.practiceSettings.status, fetchPracticeSettings, "Failed to load practice settings");
  const practiceSettingsStatus = useAppSelector((state) => state.practiceSettings.status);
  const bankDetails = useAppSelector((state): BankDetails | null => {
    const d = state.practiceSettings.data;
    if (!d) return null;
    return {
      bank_name: d.bank_name,
      bank_account_name: d.bank_account_name,
      bank_sort_code: d.bank_sort_code,
      bank_account_number: d.bank_account_number,
      bank_payment_reference: d.bank_payment_reference,
    };
  });
  // Being connected to Stripe doesn't mean the admin wants clients paying by
  // card right now — card_payments_enabled is a separate, explicit opt-in
  // (default off) so a client never sees "Pay with Stripe" only to hit a
  // checkout error because it was connected but never actually turned on.
  const cardPaymentsAvailable = useAppSelector(
    (state) =>
      !!state.practiceSettings.data?.stripe_connect_onboarded && !!state.practiceSettings.data?.card_payments_enabled,
  );

  useEffect(() => {
    if (practiceSettingsStatus !== "succeeded") return;
    if (!bankDetails?.bank_account_number && cardPaymentsAvailable) setTab("card");
  }, [practiceSettingsStatus, bankDetails, cardPaymentsAvailable]);

  useEffect(() => {
    const blockId = meta?.block_id;
    if (!blockId || !session.client_id) {
      setBlockTotalPence(null);
      setBlockSessionCount(0);
      return;
    }
    setBlockTotalLoading(true);
    supabase
      .from("sessions")
      .select("price_pence")
      .eq("client_id", session.client_id)
      .filter("metadata->>block_id", "eq", blockId)
      .then(({ data }) => {
        const rows = data ?? [];
        setBlockTotalPence(rows.reduce((sum, row) => sum + (row.price_pence ?? 0), 0));
        setBlockSessionCount(rows.length);
        setBlockTotalLoading(false);
      });
    // meta is derived from session.metadata on every render, not a stable
    // dependency — key on the block_id value itself instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.client_id, meta?.block_id]);

  const loadingDetails = practiceSettingsStatus === "idle" || practiceSettingsStatus === "loading" || blockTotalLoading;
  const hasBankDetails = !!(bankDetails?.bank_account_number && bankDetails?.bank_sort_code);

  function bankTransferNote(): string {
    if (manualPaymentStatus === "pending") {
      return "Marked as paid — waiting for your therapist to confirm the transfer arrived.";
    }
    if (manualPaymentStatus === "declined") {
      return "Your therapist couldn't verify this transfer. Please double-check the details and try again, or contact them directly.";
    }
    const blockSuffix = isBlock ? ` This covers all ${blockSessionCount} sessions in your block.` : "";
    return `Once you've sent the transfer, mark it as paid below so your therapist knows to check for it. Please use your full name in the reference if one isn't shown above.${blockSuffix}`;
  }

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
    <Modal title={isBlock ? "Pay for session block" : "Pay for session"} onClose={onClose} size="sm">
      {loadingDetails ? (
        <p className={styles.loading}>Loading payment options…</p>
      ) : (
        <>
          {hasBankDetails && cardPaymentsAvailable && (
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
                {isBlock
                  ? `Transfer the total for all ${blockSessionCount} sessions in your block to the bank account below. Click any value to copy it.`
                  : "Transfer the fee directly to the bank account below. Click any value to copy it."}
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
                <CopyRow label={isBlock ? "Amount (full block)" : "Amount"} value={`£${pricePounds}`} mono />
                {bankDetails.bank_payment_reference && (
                  <CopyRow label="Reference" value={bankDetails.bank_payment_reference} mono />
                )}
              </dl>

              <p className={styles.note}>{bankTransferNote()}</p>

              <div className={styles.actions}>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                {manualPaymentStatus !== "pending" && (
                  <Button onClick={handleRequestManualPayment} disabled={markingAsPaid || isDemo}>
                    {markingAsPaid ? "Marking as paid…" : "Mark as paid"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {tab === "card" && cardPaymentsAvailable && (
            <div className={styles.panel}>
              <p className={styles.intro}>
                {isBlock
                  ? `Pay securely by card through Stripe — this covers all ${blockSessionCount} sessions in your block.`
                  : "Pay securely by card through Stripe."}
              </p>

              <div className={styles.cardAmount}>
                <span className={styles.cardAmountValue}>£{cardTotalPounds}</span>
                {/* <span className={styles.cardAmountFee}>
                  includes 2% Stripe processing fee (session fee £{pricePounds})
                </span> */}
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

          {!hasBankDetails && !cardPaymentsAvailable && (
            <div className={styles.panel}>
              <p className={styles.intro}>
                No payment method is set up yet — ask your therapist to add bank transfer details or connect Stripe in
                their settings.
              </p>
              <div className={styles.actions}>
                <Button variant="ghost" onClick={onClose}>
                  Close
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
