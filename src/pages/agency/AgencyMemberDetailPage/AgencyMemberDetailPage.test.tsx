import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgencyMemberDetailPage from "./AgencyMemberDetailPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  Navigate: () => null,
  useNavigate: () => mockNavigate,
  useParams: () => ({ memberId: "staff-1" }),
}));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

vi.mock("@components/agency/ConfigureMemberModal/ConfigureMemberModal", () => ({ default: () => null }));
vi.mock("@components/agency/RemoveMemberModal/RemoveMemberModal", () => ({ default: () => null }));

const member = {
  id: "m-1",
  agency_id: "agency-1",
  user_id: "staff-1",
  role: "counsellor" as const,
  employment_type: "employee" as const,
  counselling_enabled: true,
  status: "active" as const,
  invited_at: null,
  joined_at: "2026-01-01T00:00:00Z",
  agreement_accepted_at: null,
  agreement_accepted_version: null,
  agreement_signed_name: null,
  first_name: "Ida",
  last_name: "Internal",
  display_name: null,
  email: "ida@example.com",
  avatar_url: null,
};

function buildState() {
  return {
    agency: {
      membership: { role: "manager", status: "active" },
      agency: { id: "agency-1", owner_id: "mgr-1", name: "Acme Agency" },
      members: [member],
      clients: [],
    },
  };
}

let state = buildState();
const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    rpc: vi.fn((fn: string) => {
      if (fn === "get_agency_member_contact_info") {
        return {
          maybeSingle: () =>
            Promise.resolve({ data: { business_name: "Old Biz", phone: "0000", address: "Old Addr" } }),
        };
      }
      return Promise.resolve({ error: null });
    }),
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock, REQUEST_TIMEOUT_MS: 20_000 }));

beforeEach(() => {
  state = buildState();
});

describe("AgencyMemberDetailPage — Business details entry point", () => {
  it("loads contact info via the narrow RPC, not a direct table select", async () => {
    render(<AgencyMemberDetailPage />);
    await waitFor(() => expect(screen.getByText("Old Biz")).toBeInTheDocument());
    expect(screen.getByText("0000")).toBeInTheDocument();
    expect(screen.getByText("Old Addr")).toBeInTheDocument();
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_agency_member_contact_info", { p_member_id: "staff-1" });
  });

  it("switches to an editable form and saves via update_agency_member_contact_info", async () => {
    render(<AgencyMemberDetailPage />);
    await waitFor(() => expect(screen.getByText("Old Biz")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const businessInput = screen.getByLabelText("Business name");
    fireEvent.change(businessInput, { target: { value: "New Biz" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(supabaseMock.rpc).toHaveBeenCalledWith("update_agency_member_contact_info", {
        p_member_id: "staff-1",
        p_business_name: "New Biz",
        p_phone: "0000",
        p_address: "Old Addr",
      }),
    );
    expect(mockShowToast).toHaveBeenCalledWith("Contact details saved.", "success");
    // Back to the read-only view, showing the just-saved value.
    expect(await screen.findByText("New Biz")).toBeInTheDocument();
  });

  it("shows an error toast and stays in edit mode when the save fails", async () => {
    supabaseMock.rpc.mockImplementation((fn: string) => {
      if (fn === "get_agency_member_contact_info") {
        return {
          maybeSingle: () => Promise.resolve({ data: { business_name: "Old Biz", phone: null, address: null } }),
        };
      }
      return Promise.resolve({ error: { message: "NOT_YOUR_MEMBER: you can only edit a member of your own agency" } });
    });
    render(<AgencyMemberDetailPage />);
    await waitFor(() => expect(screen.getByText("Old Biz")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("NOT_YOUR_MEMBER"), "danger"),
    );
    expect(screen.getByLabelText("Business name")).toBeInTheDocument(); // still editing
  });
});
