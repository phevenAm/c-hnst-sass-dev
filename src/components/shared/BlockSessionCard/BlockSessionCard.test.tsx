import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import sessionsReducer from "@store/slices/sessionsSlice";

import type { Session } from "@/models/globalTypes";
import { BlockSessionCard } from "./BlockSessionCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ practiceSettings: null, rescheduleCutoffHours: null }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/supabase.js", () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn() } }));

const makeSession = (overrides: Partial<Session> & { id: string; scheduled_at: string }): Session =>
  ({
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
    price_pence: 6000,
    reference_code: null,
    send_reminders: true,
    status: "scheduled",
    stripe_payment_intent_id: null,
    supervision_cost_pence: null,
    ...overrides,
  }) as unknown as Session;

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({ reducer: { sessions: sessionsReducer } });
  return render(<Provider store={store}>{ui}</Provider>);
}

// Regression coverage for "block tabs read 4,3,2,1 instead of 1,2,3,4"
// (2026-08-24): tabs were numbered by array index / stored block_pos without
// re-sorting first, so a caller handing sessions in reverse-chronological
// order rendered the numbers in that same reversed order.
describe("BlockSessionCard tab numbering", () => {
  it("numbers tabs 1..N by chronological order, soonest first, even when handed newest-first", () => {
    const sessions = [
      makeSession({ id: "d", scheduled_at: "2026-06-04T09:00:00.000Z" }),
      makeSession({ id: "c", scheduled_at: "2026-06-03T09:00:00.000Z" }),
      makeSession({ id: "b", scheduled_at: "2026-06-02T09:00:00.000Z" }),
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z" }),
    ];

    renderWithStore(<BlockSessionCard sessions={sessions} isAdmin />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["1", "2", "3", "4"]);
    // The soonest session (a, 1 June) should be tab #1.
    expect(tabs[0]).toHaveAccessibleName(/1 Jun 2026/i);
  });

  it("renumbers contiguously when a middle session has dropped out of the group", () => {
    // Only 1, 3, 4 are still "in play" (2 was cancelled and excluded by the caller) —
    // should read 1,2,3, not 1,3,4 (a stale block_pos gap).
    const sessions = [
      makeSession({
        id: "a",
        scheduled_at: "2026-06-01T09:00:00.000Z",
        metadata: { block_id: "blk", block_pos: 1, block_total: 4, block_start: "" },
      }),
      makeSession({
        id: "c",
        scheduled_at: "2026-06-03T09:00:00.000Z",
        metadata: { block_id: "blk", block_pos: 3, block_total: 4, block_start: "" },
      }),
      makeSession({
        id: "d",
        scheduled_at: "2026-06-04T09:00:00.000Z",
        metadata: { block_id: "blk", block_pos: 4, block_total: 4, block_start: "" },
      }),
    ];

    renderWithStore(<BlockSessionCard sessions={sessions} isAdmin />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["1", "2", "3"]);
  });

  it("shows the whole-block price from metadata, not the sum of the divided rows", () => {
    // Each row carries its £60 share; the header should still read £240 total.
    const meta = (pos: number) => ({
      block_id: "blk",
      block_pos: pos,
      block_total: 4,
      block_start: "",
      block_price_pence: 24000,
    });
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", price_pence: 6000, metadata: meta(1) }),
      makeSession({ id: "b", scheduled_at: "2026-06-08T09:00:00.000Z", price_pence: 6000, metadata: meta(2) }),
      makeSession({ id: "c", scheduled_at: "2026-06-15T09:00:00.000Z", price_pence: 6000, metadata: meta(3) }),
      makeSession({ id: "d", scheduled_at: "2026-06-22T09:00:00.000Z", price_pence: 6000, metadata: meta(4) }),
    ];

    renderWithStore(<BlockSessionCard sessions={sessions} isAdmin />);

    expect(screen.getByText(/4 session block · £240\.00 total/)).toBeInTheDocument();
  });

  it("falls back to summing live rows when metadata has no block price", () => {
    const meta = (pos: number) => ({ block_id: "blk", block_pos: pos, block_total: 2, block_start: "" });
    const sessions = [
      makeSession({ id: "a", scheduled_at: "2026-06-01T09:00:00.000Z", price_pence: 6000, metadata: meta(1) }),
      makeSession({ id: "b", scheduled_at: "2026-06-08T09:00:00.000Z", price_pence: 6000, metadata: meta(2) }),
    ];

    renderWithStore(<BlockSessionCard sessions={sessions} isAdmin />);

    expect(screen.getByText(/2 session block · £120\.00 total/)).toBeInTheDocument();
  });

  it("defaults the active tab to the soonest session", () => {
    const sessions = [
      makeSession({ id: "later", scheduled_at: "2026-06-10T09:00:00.000Z" }),
      makeSession({ id: "soonest", scheduled_at: "2026-06-05T09:00:00.000Z" }),
    ];

    renderWithStore(<BlockSessionCard sessions={sessions} isAdmin />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAccessibleName(/5 Jun 2026/i);
  });
});
