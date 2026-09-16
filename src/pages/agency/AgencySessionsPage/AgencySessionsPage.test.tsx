import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgencySessionsPage from "./AgencySessionsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

vi.mock("react-router-dom", () => ({ Navigate: () => null }));

const { staffA, staffB, supabaseMock } = vi.hoisted(() => {
  const staffA = {
    id: "m-a",
    agency_id: "agency-1",
    user_id: "user-a",
    role: "counsellor" as const,
    employment_type: "employee" as const,
    counselling_enabled: true,
    status: "active" as const,
    invited_at: null,
    joined_at: "2026-01-01T00:00:00Z",
    agreement_accepted_at: null,
    agreement_accepted_version: null,
    agreement_signed_name: null,
    first_name: "Alice",
    last_name: "Internal",
    display_name: null,
    email: "alice@example.com",
    avatar_url: null,
    color: null,
  };
  const staffB = {
    ...staffA,
    id: "m-b",
    user_id: "user-b",
    employment_type: "freelance" as const,
    first_name: "Bob",
    last_name: "External",
    email: "bob@example.com",
  };
  const sessionA = {
    id: "sess-a",
    client_id: "client-1",
    created_by: "user-a",
    scheduled_at: "2026-09-16T10:00:00Z",
    duration_minutes: 50,
    status: "scheduled",
  };
  const sessionB = {
    id: "sess-b",
    client_id: "client-2",
    created_by: "user-b",
    scheduled_at: "2026-09-16T11:00:00Z",
    duration_minutes: 50,
    status: "scheduled",
  };
  const supabaseMock = {
    from: (table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => Promise.resolve({ data: [sessionA, sessionB], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                { id: "client-1", first_name: "Cara", last_name: "Client" },
                { id: "client-2", first_name: "Dee", last_name: "Client" },
              ],
            }),
        }),
      };
    },
  };
  return { staffA, staffB, supabaseMock };
});

function buildState() {
  return {
    agency: {
      membership: { role: "manager", status: "active" },
      members: [staffA, staffB],
    },
  };
}

let state = buildState();
vi.mock("@store/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

beforeEach(() => {
  state = buildState();
});

describe("AgencySessionsPage — per-staff show/hide", () => {
  it("lists every staff member in the show/hide picker", async () => {
    render(<AgencySessionsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /show\/hide staff/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /show\/hide staff/i }));
    expect(screen.getByText("Alice Internal")).toBeInTheDocument();
    expect(screen.getByText("Bob External")).toBeInTheDocument();
  });

  it("hides a staff member's sessions from the list view when unticked, and persists the choice", async () => {
    render(<AgencySessionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /show\/hide staff/i }));

    const bobCheckbox = screen.getByRole("checkbox", { name: "Bob External" });
    expect(bobCheckbox).toBeChecked();

    // Switch to list view so session rows are plain text, not calendar cells.
    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    await screen.findByText(/Cara Client/);
    expect(screen.getByText(/Dee Client/)).toBeInTheDocument();

    fireEvent.click(bobCheckbox);
    expect(screen.queryByText(/Dee Client/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cara Client/)).toBeInTheDocument();

    expect(JSON.parse(localStorage.getItem("agencySessionsHiddenStaff") ?? "[]")).toEqual(["user-b"]);
  });

  it("restores a hidden staff member's sessions when re-ticked", async () => {
    localStorage.setItem("agencySessionsHiddenStaff", JSON.stringify(["user-b"]));
    render(<AgencySessionsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "List" }));
    await screen.findByText(/Cara Client/);
    expect(screen.queryByText(/Dee Client/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 hidden/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show\/hide staff/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Bob External" }));

    expect(await screen.findByText(/Dee Client/)).toBeInTheDocument();
  });
});
