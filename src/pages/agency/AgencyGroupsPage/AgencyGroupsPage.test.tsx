import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgencyGroupsPage from "./AgencyGroupsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/supabase.js", () => ({ supabase: { from: () => ({ insert: vi.fn(), delete: vi.fn() }) } }));

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

describe("AgencyGroupsPage — staff (non-manager) view", () => {
  it("shows a read-only list of groups they facilitate, with no manage/create controls (permission boundary)", () => {
    state = buildState({ isManager: false });
    render(<AgencyGroupsPage />);
    expect(screen.getByRole("heading", { name: "Your groups" })).toBeInTheDocument();
    expect(screen.getByText("Tuesday group")).toBeInTheDocument();
    // Description + client count only — no staff count, no names: this view
    // never claims to resolve names it isn't guaranteed to have RLS access to.
    expect(screen.getByText("For anxiety · 1 client")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New group" })).not.toBeInTheDocument();
  });

  it("does not open a manage modal when a group row is clicked (read-only)", () => {
    state = buildState({ isManager: false });
    render(<AgencyGroupsPage />);
    fireEvent.click(screen.getByText("Tuesday group"));
    expect(screen.queryByRole("heading", { name: "For anxiety" })).not.toBeInTheDocument();
  });

  it("shows an empty state when facilitating no groups (sad path)", () => {
    state = buildState({ isManager: false, groups: [] });
    render(<AgencyGroupsPage />);
    expect(screen.getByText(/haven't been added to any groups/)).toBeInTheDocument();
  });
});

describe("AgencyGroupsPage — manager view", () => {
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
