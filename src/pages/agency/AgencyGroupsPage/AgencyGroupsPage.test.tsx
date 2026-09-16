import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgencyGroupsPage from "./AgencyGroupsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/supabase.js", () => ({ supabase: { from: () => ({ insert: vi.fn(), delete: vi.fn() }) } }));

let redirected: string | null = null;
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }: { to: string }) => {
    redirected = to;
    return null;
  },
}));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const group = {
  id: "g-1",
  agency_id: "agency-1",
  name: "Tuesday group",
  description: "For anxiety",
  created_by: "mgr-1",
  created_at: "",
  members: [{ id: "gm-1", group_id: "g-1", client_id: null, stub_id: "stub-1", added_at: "" }],
  staff: [{ id: "gs-1", group_id: "g-1", user_id: "staff-1", added_at: "" }],
};

function buildState({ isManager = true, groups = [group], status = "succeeded" } = {}) {
  return {
    agency: {
      membership: { role: isManager ? "manager" : "counsellor", status: "active" },
      agency: { id: "agency-1", name: "Acme Agency" },
      clients: [],
      members: [],
    },
    groups: { groups, status, error: null },
  };
}

let state = buildState();
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

describe("AgencyGroupsPage", () => {
  it("redirects a non-manager away (permission gate)", () => {
    redirected = null;
    state = buildState({ isManager: false });
    render(<AgencyGroupsPage />);
    expect(redirected).toBe("/agency");
  });

  it("lists each group with its member and staff counts (happy path)", () => {
    state = buildState();
    render(<AgencyGroupsPage />);
    expect(screen.getByText("Tuesday group")).toBeInTheDocument();
    expect(screen.getByText("1 client · 1 staff")).toBeInTheDocument();
  });

  it("shows an empty state when there are no groups yet (sad path)", () => {
    state = buildState({ groups: [] });
    render(<AgencyGroupsPage />);
    expect(screen.getByText(/No groups yet/)).toBeInTheDocument();
  });

  it("opens the create-group modal from the New group button", () => {
    state = buildState();
    render(<AgencyGroupsPage />);
    fireEvent.click(screen.getByRole("button", { name: "New group" }));
    expect(screen.getByRole("heading", { name: "New group" })).toBeInTheDocument();
  });

  it("opens the manage-group modal when a group row is clicked", () => {
    state = buildState();
    render(<AgencyGroupsPage />);
    fireEvent.click(screen.getByText("Tuesday group"));
    expect(screen.getByRole("heading", { name: "Tuesday group" })).toBeInTheDocument();
    expect(screen.getByText("For anxiety")).toBeInTheDocument();
  });
});
