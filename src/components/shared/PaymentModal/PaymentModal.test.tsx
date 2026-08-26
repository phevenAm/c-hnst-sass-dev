import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@models/globalTypes";
import practiceSettingsReducer from "@store/slices/practiceSettingsSlice";

import PaymentModal from "./PaymentModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isDemo: false }),
}));

const mockShowToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/lib/supabase.js", () => ({ supabase: supabaseMock }));

// ─── Fixtures ───────────────────────────────────────────────────────────────

const bankDetails = {
  bank_name: "Test Bank",
  bank_account_name: "Jane Therapist",
  bank_sort_code: "123456",
  bank_account_number: "12345678",
  bank_payment_reference: "REF-1",
};

const singleSession = {
  id: "session-1",
  client_id: "client-1",
  created_by: "admin-1",
  price_pence: 5000,
  manual_payment_status: "none",
  metadata: null,
} as unknown as Session;

const blockSession = {
  id: "session-block-1",
  client_id: "client-1",
  created_by: "admin-1",
  price_pence: 5000,
  manual_payment_status: "none",
  metadata: { block_id: "blk-1", block_pos: 1, block_total: 3, block_start: "2026-09-01T00:00:00.000Z" },
} as unknown as Session;

// price_pence for every session sharing blk-1 — 3 x 5000 = 15000 pence = £150.00
const blockSiblingPrices = [{ price_pence: 5000 }, { price_pence: 5000 }, { price_pence: 5000 }];

// Bank details now come from the shared practiceSettingsSlice cache, not a
// direct fetch inside PaymentModal — preload a test store with them instead
// of mocking a practice_settings supabase chain. Block totals are still
// fetched directly from the sessions table, so that mock stays.
function mockSessionsTable(blockRows: { price_pence: number }[]) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            filter: () => ({
              neq: () => Promise.resolve({ data: blockRows, error: null }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

function renderPaymentModal(session: Session) {
  return renderPaymentModalWithData(session, {
    ...bankDetails,
    stripe_connect_onboarded: true,
    card_payments_enabled: true,
  });
}

// biome-ignore lint/suspicious/noExplicitAny: test fixture, shape matches PracticeSettingsCache loosely
function renderPaymentModalWithData(session: Session, data: any) {
  const testStore = configureStore({
    reducer: { practiceSettings: practiceSettingsReducer },
    preloadedState: { practiceSettings: { data, status: "succeeded", error: null } },
  });
  return render(
    <Provider store={testStore}>
      <PaymentModal session={session} onClose={() => {}} />
    </Provider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("PaymentModal — single session", () => {
  it("shows the single session's price, not a block total", async () => {
    mockSessionsTable([]);
    renderPaymentModal(singleSession);

    expect(await screen.findByText("£50.00")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pay for session" })).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("requests manual payment for just this session", async () => {
    mockSessionsTable([]);
    supabaseMock.rpc.mockResolvedValue({ error: null });
    renderPaymentModal(singleSession);

    fireEvent.click(await screen.findByRole("button", { name: /mark as paid/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("request_manual_payment", { p_session_id: "session-1" });
    });
  });
});

describe("PaymentModal — block session", () => {
  it("shows the block total across all sessions in the block, not this session's price", async () => {
    mockSessionsTable(blockSiblingPrices);
    renderPaymentModal(blockSession);

    expect(await screen.findByText("£150.00")).toBeInTheDocument();
    expect(screen.queryByText("£50.00")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pay for session block" })).toBeInTheDocument();
  });

  it("labels the bank transfer amount as covering the full block", async () => {
    mockSessionsTable(blockSiblingPrices);
    renderPaymentModal(blockSession);

    expect(await screen.findByText("Amount (full block)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Transfer the total for all 3 sessions in your block to the bank account below. Click any value to copy it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/This covers all 3 sessions in your block\.$/)).toBeInTheDocument();
  });

  it("mentions the block in the card payment intro and button", async () => {
    mockSessionsTable(blockSiblingPrices);
    renderPaymentModal(blockSession);

    fireEvent.click(await screen.findByRole("button", { name: "Pay with Stripe" }));

    expect(await screen.findByText(/covers all 3 sessions in your block/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay £150.00 with Stripe" })).toBeInTheDocument();
  });

  it("still sends only this session's id to checkout — the server sums the block", async () => {
    mockSessionsTable(blockSiblingPrices);
    supabaseMock.functions.invoke.mockResolvedValue({ data: { url: "https://stripe.test/checkout" }, error: null });
    renderPaymentModal(blockSession);

    fireEvent.click(await screen.findByRole("button", { name: "Pay with Stripe" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pay £150.00 with Stripe" }));

    await waitFor(() => {
      expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("create-checkout-session", {
        body: { session_id: "session-block-1" },
      });
    });
  });

  it("requesting manual payment on one block session flags the whole block server-side, not just this row", async () => {
    // The client only ever calls the RPC with the session it has in hand — block
    // propagation happens inside request_manual_payment itself (see
    // 20260819000006_block_aware_manual_payment.sql), not from the client fanning
    // out calls per sibling session.
    mockSessionsTable(blockSiblingPrices);
    supabaseMock.rpc.mockResolvedValue({ error: null });
    renderPaymentModal(blockSession);

    fireEvent.click(await screen.findByRole("button", { name: /mark as paid/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(supabaseMock.rpc).toHaveBeenCalledWith("request_manual_payment", { p_session_id: "session-block-1" });
    });
  });
});

describe("PaymentModal — card payment availability", () => {
  it("hides the Stripe tab and defaults to bank transfer when Stripe isn't connected", async () => {
    mockSessionsTable([]);
    renderPaymentModalWithData(singleSession, {
      ...bankDetails,
      stripe_connect_onboarded: false,
      card_payments_enabled: false,
    });

    expect(await screen.findByRole("button", { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay with Stripe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay .* with stripe/i })).not.toBeInTheDocument();
  });

  it("hides the Stripe tab when connected but the admin has toggled it off", async () => {
    mockSessionsTable([]);
    renderPaymentModalWithData(singleSession, {
      ...bankDetails,
      stripe_connect_onboarded: true,
      card_payments_enabled: false,
    });

    expect(await screen.findByRole("button", { name: /mark as paid/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay with Stripe" })).not.toBeInTheDocument();
  });

  it("shows the Stripe tab when connected and explicitly enabled", async () => {
    mockSessionsTable([]);
    renderPaymentModalWithData(singleSession, {
      ...bankDetails,
      stripe_connect_onboarded: true,
      card_payments_enabled: true,
    });

    expect(await screen.findByRole("button", { name: "Pay with Stripe" })).toBeInTheDocument();
  });

  it("shows a fallback message instead of a broken card tab when neither payment method is set up", async () => {
    mockSessionsTable([]);
    const noBank = {
      bank_name: null,
      bank_account_name: null,
      bank_sort_code: null,
      bank_account_number: null,
      bank_payment_reference: null,
      stripe_connect_onboarded: false,
      card_payments_enabled: false,
    };
    renderPaymentModalWithData(singleSession, noBank);

    expect(await screen.findByText(/no payment method is set up yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as paid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay with Stripe" })).not.toBeInTheDocument();
  });
});

// Regression: a cancelled session (e.g. auto-cancelled for non-payment) kept
// whatever manual_payment_status it had before cancellation — including
// 'declined' — so if this modal ever opened for one (a stale prop, a direct
// link), it redisplayed the old admin-declined note as if it were current,
// with a working "Mark as paid" button. This is defence in depth: the actual
// callers now all refuse to open this modal for a cancelled session, but the
// modal itself should never assume that's true.
describe("PaymentModal — cancelled session", () => {
  it("shows a cancelled message instead of payment instructions, even with a stale declined manual-payment status", () => {
    renderPaymentModalWithData(
      { ...singleSession, status: "cancelled", manual_payment_status: "declined" },
      bankDetails,
    );

    expect(screen.getByText(/this session has been cancelled/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't verify this transfer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as paid/i })).not.toBeInTheDocument();
  });
});
