import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sessionsReducer from "@store/slices/sessionsSlice";

import type { Session } from "@/models/globalTypes";
import { SessionCard } from "./SessionCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockUseAuth = vi.fn(() => ({ practiceSettings: null, rescheduleCutoffHours: null, isDemo: false }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  mockUseAuth.mockReturnValue({ practiceSettings: null, rescheduleCutoffHours: null, isDemo: false });
});

const mockShowToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock("@/lib/supabase.js", () => ({ supabase: { functions: { invoke: vi.fn() }, from: vi.fn() } }));

const baseSession: Session = {
  id: "sess-1",
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
  paid: true,
  paid_at: null,
  price_pence: 6000,
  reference_code: null,
  send_reminders: true,
  status: "scheduled",
  stripe_payment_intent_id: null,
  supervision_cost_pence: null,
  scheduled_at: "2099-01-01T09:00:00.000Z",
} as unknown as Session;

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({ reducer: { sessions: sessionsReducer } });
  return render(<Provider store={store}>{ui}</Provider>);
}

describe("SessionCard — client name header", () => {
  it("shows the client's name when isAdmin and clientLabel are both given (happy path)", () => {
    renderWithStore(<SessionCard session={baseSession} isAdmin clientLabel="Ada Lovelace" />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("does not show a name when no clientLabel is given, e.g. a client's own session list (sad path)", () => {
    renderWithStore(<SessionCard session={baseSession} isAdmin />);
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("does not show a name to the client themselves even if clientLabel were somehow passed (sad path)", () => {
    renderWithStore(<SessionCard session={baseSession} clientLabel="Ada Lovelace" />);
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });
});

// Regression coverage (2026-08-25): "Mark as paid" dispatched the update and
// then showed "Updated payment status" unconditionally — sessions IS covered
// by the DB's block_demo_write trigger, so the write itself never actually
// went through in demo mode, but the toast lied and claimed it had.
describe("SessionCard — demo mode", () => {
  // Both the desktop button and the mobile SplitButton render simultaneously
  // in jsdom (no real CSS media query to hide either) — the desktop one
  // carries data-action-type="payment", which is a more direct, unambiguous
  // target than matching on the "Mark as paid" label shared by both.
  function clickDesktopMarkAsPaid(container: HTMLElement) {
    const btn = container.querySelector('button[data-action-type="payment"]');
    if (!btn) throw new Error("Could not find the desktop Mark as paid button");
    fireEvent.click(btn);
  }

  it("does not toggle paid status, and says so instead of claiming success (happy path)", () => {
    // toggleNoShowOrPayment lives in useSessionCard, which reads isDemo from
    // useAuth() directly — not from the isDemo prop SessionCard itself takes.
    mockUseAuth.mockReturnValue({ practiceSettings: null, rescheduleCutoffHours: null, isDemo: true });
    const { container } = renderWithStore(<SessionCard session={{ ...baseSession, paid: false }} isAdmin isDemo />);

    clickDesktopMarkAsPaid(container);

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i));
    expect(mockShowToast).not.toHaveBeenCalledWith("Updated payment status");
  });

  it("does toggle paid status for a real (non-demo) admin (sad path — confirms the guard isn't just always-on)", () => {
    const { container } = renderWithStore(<SessionCard session={{ ...baseSession, paid: false }} isAdmin />);

    clickDesktopMarkAsPaid(container);

    expect(mockShowToast).toHaveBeenCalledWith("Updated payment status");
  });
});

// Regression: a client-facing session card only checked "!isAdmin && upcoming"
// before showing Pay/Reschedule/Cancel — a session auto-cancelled for
// non-payment (or cancelled any other way) still had a future scheduled_at,
// so it kept showing a working Pay button after it had already been
// cancelled. isCancelled was already computed for badge styling but never
// used to gate these actions.
describe("SessionCard — client actions on a cancelled session", () => {
  it("hides Pay/Reschedule/Cancel for a cancelled upcoming session (happy path)", () => {
    renderWithStore(<SessionCard session={{ ...baseSession, status: "cancelled", paid: false }} />);

    expect(screen.queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
  });

  it("still shows Pay/Reschedule for a scheduled upcoming session (sad path — confirms the guard isn't just always-off)", () => {
    renderWithStore(<SessionCard session={{ ...baseSession, status: "scheduled", paid: false }} />);

    expect(screen.getByRole("button", { name: "Pay" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
  });

  // admin_todos 57101fb3 — "no option to cancel sessions". The admin gets a
  // direct Cancel action on a live scheduled session.
  it("offers a Cancel action on a scheduled session for the admin", () => {
    renderWithStore(<SessionCard session={{ ...baseSession, status: "scheduled", paid: false }} isAdmin />);
    expect(screen.getAllByText("Cancel").length).toBeGreaterThan(0);
  });
});
