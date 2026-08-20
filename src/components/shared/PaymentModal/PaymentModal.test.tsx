import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@models/globalTypes";

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

function mockSupabaseWith(bankRow: typeof bankDetails | null, blockRows: { price_pence: number }[]) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "practice_settings") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: bankRow, error: null }),
          }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            filter: () => Promise.resolve({ data: blockRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("PaymentModal — single session", () => {
  it("shows the single session's price, not a block total", async () => {
    mockSupabaseWith(bankDetails, []);
    render(<PaymentModal session={singleSession} onClose={() => {}} />);

    expect(await screen.findByText("£50.00")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pay for session" })).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("requests manual payment for just this session", async () => {
    mockSupabaseWith(bankDetails, []);
    supabaseMock.rpc.mockResolvedValue({ error: null });
    render(<PaymentModal session={singleSession} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /mark as paid/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("request_manual_payment", { p_session_id: "session-1" });
    });
  });
});

describe("PaymentModal — block session", () => {
  it("shows the block total across all sessions in the block, not this session's price", async () => {
    mockSupabaseWith(bankDetails, blockSiblingPrices);
    render(<PaymentModal session={blockSession} onClose={() => {}} />);

    expect(await screen.findByText("£150.00")).toBeInTheDocument();
    expect(screen.queryByText("£50.00")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pay for session block" })).toBeInTheDocument();
  });

  it("labels the bank transfer amount as covering the full block", async () => {
    mockSupabaseWith(bankDetails, blockSiblingPrices);
    render(<PaymentModal session={blockSession} onClose={() => {}} />);

    expect(await screen.findByText("Amount (full block)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Transfer the total for all 3 sessions in your block to the bank account below. Click any value to copy it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/This covers all 3 sessions in your block\.$/)).toBeInTheDocument();
  });

  it("mentions the block in the card payment intro and button", async () => {
    mockSupabaseWith(bankDetails, blockSiblingPrices);
    render(<PaymentModal session={blockSession} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Pay with Stripe" }));

    expect(await screen.findByText(/covers all 3 sessions in your block/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay £150.00 with Stripe" })).toBeInTheDocument();
  });

  it("still sends only this session's id to checkout — the server sums the block", async () => {
    mockSupabaseWith(bankDetails, blockSiblingPrices);
    supabaseMock.functions.invoke.mockResolvedValue({ data: { url: "https://stripe.test/checkout" }, error: null });
    render(<PaymentModal session={blockSession} onClose={() => {}} />);

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
    mockSupabaseWith(bankDetails, blockSiblingPrices);
    supabaseMock.rpc.mockResolvedValue({ error: null });
    render(<PaymentModal session={blockSession} onClose={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /mark as paid/i }));

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
      expect(supabaseMock.rpc).toHaveBeenCalledWith("request_manual_payment", { p_session_id: "session-block-1" });
    });
  });
});
