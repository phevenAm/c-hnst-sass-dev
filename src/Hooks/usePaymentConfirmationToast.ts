import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";

type PaymentEmailTarget = { type: "session"; sessionId: string } | { type: "stub"; stubSessionId: string };

// Shared by every "mark as paid" action (ledger row, SessionCard button,
// stub session toggle) so the same toast — and the same block-aware edge
// functions — back all of them consistently. `hasEmail` gates whether the
// "Send email" action appears at all; when it's false this is just
// `showToast(message)`. The edge functions themselves detect a shared
// block_id on the session/stub session passed in and cover every sibling
// with one email, so the caller only ever needs the one id that was
// actually clicked.
export function usePaymentConfirmationToast() {
  const { showToast } = useToast();

  return (hasEmail: boolean, target: PaymentEmailTarget, message = "Marked as paid.") => {
    if (!hasEmail) {
      showToast(message, "success");
      return;
    }

    const sendEmail = async () => {
      const fnName = target.type === "session" ? "send-payment-notification" : "notify-stub-payment-recorded";
      const body =
        target.type === "session" ? { session_id: target.sessionId } : { stub_session_id: target.stubSessionId };
      const { error } = await supabase.functions.invoke(fnName, { body });
      showToast(
        error ? "Couldn't send the confirmation email." : "Confirmation email sent.",
        error ? "danger" : "success",
      );
    };

    showToast(message, "success", { label: "Send email", onClick: sendEmail });
  };
}
