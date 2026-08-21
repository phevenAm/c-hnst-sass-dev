import { describe, expect, it } from "vitest";

import type { Session } from "@/models/globalTypes";
import { deriveBlockPaymentState } from "./blockPaymentState";

const makeSession = (overrides: Partial<Session> & { id: string }): Session => ({
  address: null,
  attended: null,
  client_id: "client-1",
  created_at: "2026-01-01T00:00:00.000Z",
  created_by: "admin-1",
  duration_minutes: 50,
  google_event_id: null,
  imported_from_stub_id: null,
  is_supervision: false,
  location: null,
  manual_payment_status: "none",
  metadata: null,
  notes: null,
  paid: false,
  paid_at: null,
  price_pence: 5000,
  reference_code: null,
  scheduled_at: "2026-06-01T09:00:00.000Z",
  send_reminders: true,
  status: "scheduled",
  stripe_payment_intent_id: null,
  supervision_cost_pence: null,
  ...overrides,
});

describe("deriveBlockPaymentState", () => {
  it("is allPaid only when every session in the block is paid", () => {
    const allPaid = deriveBlockPaymentState([
      makeSession({ id: "a", paid: true }),
      makeSession({ id: "b", paid: true }),
    ]);
    expect(allPaid.allPaid).toBe(true);

    const partiallyPaid = deriveBlockPaymentState([
      makeSession({ id: "a", paid: true }),
      makeSession({ id: "b", paid: false }),
    ]);
    expect(partiallyPaid.allPaid).toBe(false);
  });

  it("reports pending if ANY session in the block is pending — a client shouldn't see 'Pay' on one tab while a sibling is already mid-request", () => {
    const state = deriveBlockPaymentState([
      makeSession({ id: "a", manual_payment_status: "pending" }),
      makeSession({ id: "b", manual_payment_status: "none" }),
    ]);
    expect(state.manualStatus).toBe("pending");
  });

  it("prioritises pending over approved over declined over none, in that order", () => {
    expect(
      deriveBlockPaymentState([
        makeSession({ id: "a", manual_payment_status: "approved" }),
        makeSession({ id: "b", manual_payment_status: "declined" }),
      ]).manualStatus,
    ).toBe("approved");

    expect(
      deriveBlockPaymentState([
        makeSession({ id: "a", manual_payment_status: "declined" }),
        makeSession({ id: "b", manual_payment_status: "none" }),
      ]).manualStatus,
    ).toBe("declined");
  });

  it("treats a fully-paid, fully-approved block as consistent", () => {
    const state = deriveBlockPaymentState([
      makeSession({ id: "a", paid: true, manual_payment_status: "approved" }),
      makeSession({ id: "b", paid: true, manual_payment_status: "approved" }),
      makeSession({ id: "c", paid: true, manual_payment_status: "approved" }),
    ]);
    expect(state).toEqual({ allPaid: true, manualStatus: "approved" });
  });

  it("returns not-paid/none for an empty block (defensive default)", () => {
    expect(deriveBlockPaymentState([])).toEqual({ allPaid: false, manualStatus: "none" });
  });
});
