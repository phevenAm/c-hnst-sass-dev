import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgencyMembersPage from "./AgencyMembersPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  Navigate: () => null,
  useNavigate: () => mockNavigate,
}));

vi.mock("@context/AuthContext", () => ({ useAuth: () => ({ authUser: { id: "mgr-1" } }) }));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const internalMember = {
  id: "m-1",
  agency_id: "agency-1",
  user_id: "staff-internal",
  role: "counsellor" as const,
  employment_type: "employee" as const,
  counselling_enabled: true,
  status: "active" as const,
  invited_at: null,
  joined_at: "2026-01-15T00:00:00Z",
  agreement_accepted_at: null,
  agreement_accepted_version: null,
  agreement_signed_name: null,
  first_name: "Ida",
  last_name: "Internal",
  display_name: null,
  email: "ida@example.com",
  avatar_url: null,
};

const externalMember = {
  ...internalMember,
  id: "m-2",
  user_id: "staff-external",
  employment_type: "freelance" as const,
  first_name: "Fran",
  last_name: "External",
  email: "fran@example.com",
  joined_at: "2026-03-01T00:00:00Z",
};

function buildState(members = [internalMember, externalMember]) {
  return {
    agency: {
      membership: { role: "manager", status: "active" },
      agency: { id: "agency-1", owner_id: "mgr-1", name: "Acme Agency" },
      members,
      membersStatus: "succeeded",
      clients: [],
    },
  };
}

let state = buildState();
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

describe("AgencyMembersPage", () => {
  it("shows a profile picture (Avatar) and join date for every member", () => {
    state = buildState();
    render(<AgencyMembersPage />);

    expect(screen.getByText("Ida Internal")).toBeInTheDocument();
    expect(screen.getByText(/joined 15 Jan 2026/)).toBeInTheDocument();
    expect(screen.getByText(/joined 1 Mar 2026/)).toBeInTheDocument();
    // Avatar renders initials when there's no avatar_url — proves the
    // component actually mounted for each row, not just a name string.
    expect(screen.getAllByText("II").length).toBeGreaterThan(0); // Ida Internal
    expect(screen.getAllByText("FE").length).toBeGreaterThan(0); // Fran External
  });

  it("labels members Internal / External via employment_type", () => {
    state = buildState();
    render(<AgencyMembersPage />);
    // Two matches each: the filter tab and the member's own badge.
    expect(screen.getAllByText("Internal")).toHaveLength(2);
    expect(screen.getAllByText("External")).toHaveLength(2);
  });

  it("defaults to showing all staff, then filters to just Internal or External", () => {
    state = buildState();
    render(<AgencyMembersPage />);
    expect(screen.getByText("Ida Internal")).toBeInTheDocument();
    expect(screen.getByText("Fran External")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Internal" }));
    expect(screen.getByText("Ida Internal")).toBeInTheDocument();
    expect(screen.queryByText("Fran External")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "External" }));
    expect(screen.queryByText("Ida Internal")).not.toBeInTheDocument();
    expect(screen.getByText("Fran External")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Ida Internal")).toBeInTheDocument();
    expect(screen.getByText("Fran External")).toBeInTheDocument();
  });

  it("shows an empty state naming the filter when it excludes every member", () => {
    state = buildState([internalMember]);
    render(<AgencyMembersPage />);
    fireEvent.click(screen.getByRole("tab", { name: "External" }));
    expect(screen.getByText("No external staff.")).toBeInTheDocument();
  });

  it("navigates to the member's detail page when a row is clicked", () => {
    state = buildState();
    render(<AgencyMembersPage />);
    fireEvent.click(screen.getByText("Ida Internal"));
    expect(mockNavigate).toHaveBeenCalledWith("/agency/members/staff-internal");
  });
});
