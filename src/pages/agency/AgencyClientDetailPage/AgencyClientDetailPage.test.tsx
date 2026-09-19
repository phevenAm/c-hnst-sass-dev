import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgencyClientDetailPage from "./AgencyClientDetailPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const thenable = () => ({ then: (cb: (r: { data: unknown[] }) => void) => cb({ data: [] }) });
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order: () => thenable() }) }),
      }),
    }),
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  Navigate: () => null,
  useNavigate: () => mockNavigate,
  useParams: () => ({ clientId: "stub-1" }),
}));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const client = {
  id: "stub-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  codename: null,
  agency_id: "agency-1",
  default_rate_pence: null,
  allow_staff_custom_rate: false,
  availability_note: null,
  created_by: "mgr-1",
  created_at: "",
  linked_user_id: null,
  previously_counselled: false,
  assignment: null,
};

const group = {
  id: "g-1",
  agency_id: "agency-1",
  name: "Tuesday group",
  description: null,
  created_by: "mgr-1",
  created_at: "",
  members: [{ id: "gm-1", group_id: "g-1", client_id: null, stub_id: "stub-1", added_at: "" }],
  staff: [],
};

function buildState({ groups = [] as (typeof group)[] } = {}) {
  return {
    agency: {
      membership: { role: "manager", status: "active" },
      agency: { id: "agency-1", name: "Acme Agency" },
      clients: [client],
      members: [],
    },
    groups: { groups, status: "succeeded", error: null },
  };
}

let state = buildState();
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

describe("AgencyClientDetailPage — Groups card", () => {
  it("shows a not-in-any-group message with a link to Groups when the client has no groups (sad path)", () => {
    state = buildState({ groups: [] });
    render(<AgencyClientDetailPage />);
    expect(screen.getByText(/Not in any group/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Groups page" }));
    expect(mockNavigate).toHaveBeenCalledWith("/agency/groups");
  });

  it("lists the groups this specific client belongs to, scoped by stub id (happy path)", () => {
    const otherStubsGroup = { ...group, id: "g-2", name: "Not this client", members: [] };
    state = buildState({ groups: [group, otherStubsGroup] });
    render(<AgencyClientDetailPage />);

    expect(screen.getByText("Tuesday group")).toBeInTheDocument();
    expect(screen.queryByText("Not this client")).not.toBeInTheDocument();
  });
});
