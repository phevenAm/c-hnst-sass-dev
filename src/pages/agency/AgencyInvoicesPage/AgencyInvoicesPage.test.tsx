import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgencyInvoicesPage from "./AgencyInvoicesPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("react-router-dom", () => ({
  Navigate: () => null,
}));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const invoice = {
  id: "inv-1",
  agency_id: "agency-1",
  staff_user_id: "staff-1",
  issued_by: "mgr-1",
  number: 7,
  reference: "AGINV-0007",
  description: "September seat fee",
  amount_pence: 5000,
  status: "sent" as const,
  issue_date: "2026-09-01",
  due_date: "2026-09-15",
  sent_at: "2026-09-01T00:00:00Z",
  paid_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const staffMember = {
  id: "m-1",
  agency_id: "agency-1",
  user_id: "staff-1",
  role: "counsellor" as const,
  employment_type: "freelance" as const,
  counselling_enabled: true,
  status: "active" as const,
  invited_at: null,
  joined_at: "2026-01-01T00:00:00Z",
  agreement_accepted_at: null,
  agreement_accepted_version: null,
  agreement_signed_name: null,
  first_name: "Sam",
  last_name: "Staff",
  display_name: null,
  email: null,
  avatar_url: null,
};

// Selectors run for real against this fake slice of state — only dispatch is mocked.
function buildState(overrides: { invoices?: (typeof invoice)[]; invoicesStatus?: string } = {}) {
  return {
    agency: {
      membership: { role: "manager", status: "active" },
      agency: { id: "agency-1", owner_id: "mgr-1" },
      members: [staffMember],
      invoices: overrides.invoices ?? [invoice],
      invoicesStatus: overrides.invoicesStatus ?? "succeeded",
    },
  };
}

let state = buildState();
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

describe("AgencyInvoicesPage", () => {
  it("shows the empty state when there are no invoices and no staff to bill", () => {
    state = buildState({ invoices: [] });
    render(<AgencyInvoicesPage />);
    expect(screen.getByText(/no invoices here yet/i)).toBeInTheDocument();
  });

  it("renders an invoice row with its staff member, amount and status", () => {
    state = buildState();
    render(<AgencyInvoicesPage />);
    expect(screen.getByText(/AGINV-0007/)).toBeInTheDocument();
    expect(screen.getByText(/Sam Staff/)).toBeInTheDocument();
    expect(screen.getAllByText("£50.00").length).toBeGreaterThan(0);
    expect(screen.getByText("sent")).toBeInTheDocument();
  });

  it("deleting an invoice requires confirmation — clicking Delete opens a modal, not an immediate delete", () => {
    state = buildState();
    render(<AgencyInvoicesPage />);
    mockDispatch.mockClear(); // drop the mount-time fetchAgencyInvoices/fetchAgencyMembers calls

    fireEvent.click(screen.getByLabelText("Show more options"));
    fireEvent.click(screen.getByText("Delete"));

    expect(screen.getByText(/Delete AGINV-0007\?/i)).toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("cancelling the confirm modal does not delete", () => {
    state = buildState();
    render(<AgencyInvoicesPage />);
    mockDispatch.mockClear();

    fireEvent.click(screen.getByLabelText("Show more options"));
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByText(/Delete AGINV-0007\?/i)).not.toBeInTheDocument();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("confirming the delete modal dispatches the delete action", async () => {
    state = buildState();
    render(<AgencyInvoicesPage />);
    mockDispatch.mockClear();

    fireEvent.click(screen.getByLabelText("Show more options"));
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByRole("button", { name: /yes, confirm/i }));

    await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
  });
});
