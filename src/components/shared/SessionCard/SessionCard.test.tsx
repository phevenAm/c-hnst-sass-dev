import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import sessionsReducer from "@store/slices/sessionsSlice";

import type { Session } from "@/models/globalTypes";
import { SessionCard } from "./SessionCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ practiceSettings: null, rescheduleCutoffHours: null }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
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
