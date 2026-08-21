import type { Session } from "@/models/globalTypes";

export type BlockPaymentState = {
  /** Blocks are paid for as one unit (one Stripe Checkout, or one bank
   *  transfer covering every session) — never session-by-session — so this
   *  is strictly "every session in the block is paid", not a fraction. */
  allPaid: boolean;
  manualStatus: string;
};

const STATUS_PRIORITY = ["pending", "approved", "declined", "none"];

// Every payment path that touches a block (Stripe webhook, the manual-
// payment RPCs, the admin's direct paid toggle — see the
// cascade_block_payment DB trigger) cascades to every sibling in one
// statement, so in steady state every session's paid/manual_payment_status
// already agree. But realtime delivers that cascade as N separate row
// events rather than atomically, and SessionCard's Pay/Mark-as-paid
// buttons key off whichever single session is on the active tab — without
// deriving a shared status here, a tab could show "Pay" while a sibling
// (whose update just landed a moment earlier) already shows "pending",
// which is exactly the inconsistent state that would let a client
// re-trigger a payment that's already in flight for the same block.
export function deriveBlockPaymentState(sessions: Session[]): BlockPaymentState {
  const allPaid = sessions.length > 0 && sessions.every((s) => s.paid);
  const manualStatus =
    STATUS_PRIORITY.find((status) => sessions.some((s) => s.manual_payment_status === status)) ?? "none";
  return { allPaid, manualStatus };
}
