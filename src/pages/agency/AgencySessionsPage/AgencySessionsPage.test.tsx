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
  // Regression fixture: a staff member's OFFLINE/stub-client session. Before
  // the fix, AgencySessionsPage never queried stub_sessions at all — this
  // simply never appeared here, with no error to explain why.
  const stubSessionA = {
    id: "stub-sess-a",
    stub_id: "stub-1",
    admin_id: "user-a",
    scheduled_at: "2026-09-16T12:00:00Z",
    duration_minutes: 50,
    status: "scheduled",
  };

  // A Proxy that answers any chained method call (.select(), .gte(), .in(),
  // .order(), whatever the real query builder needs) with itself, and
  // resolves to `result` when awaited/`.then`ed — so it doesn't matter
  // exactly which methods the page chains, present or future.
  function chainable(result: unknown) {
    const target = {};
    const proxy: any = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return () => proxy;
      },
    });
    return proxy;
  }

  const supabaseMock = {
    from: (table: string) => {
      if (table === "sessions") return chainable({ data: [sessionA, sessionB], error: null });
      if (table === "stub_sessions") return chainable({ data: [stubSessionA], error: null });
      if (table === "client_stubs")
        return chainable({ data: [{ id: "stub-1", first_name: "Eve", last_name: "Stub" }] });
      // "users"
      return chainable({
        data: [
          { id: "client-1", first_name: "Cara", last_name: "Client" },
          { id: "client-2", first_name: "Dee", last_name: "Client" },
        ],
      });
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

// Regression coverage for the 2026-09-16 bug: a staff member's stub-client
// session was invisible on this page because it only ever queried
// public.sessions, never public.stub_sessions.
describe("AgencySessionsPage — stub (offline client) sessions", () => {
  it("shows a staff member's stub-client session alongside their real ones (regression)", async () => {
    render(<AgencySessionsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "List" }));

    await screen.findByText(/Cara Client/);
    expect(screen.getByText(/Dee Client/)).toBeInTheDocument();
    expect(screen.getByText(/Eve Stub/)).toBeInTheDocument();
    // Attributed to the right staff member, same as a real session would be.
    expect(screen.getByText(/Eve Stub · Alice Internal/)).toBeInTheDocument();
  });

  it("respects the internal/external staff filter for stub sessions too", async () => {
    render(<AgencySessionsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "List" }));
    await screen.findByText(/Eve Stub/);

    // Alice (Eve's counsellor) is "employee" — filtering to External should
    // hide her stub session same as it would her real ones.
    fireEvent.click(screen.getByRole("tab", { name: "External" }));
    expect(screen.queryByText(/Eve Stub/)).not.toBeInTheDocument();
    expect(screen.getByText(/Dee Client/)).toBeInTheDocument();
  });

  it("hides a staff member's stub session when they're unticked in show/hide staff", async () => {
    render(<AgencySessionsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "List" }));
    await screen.findByText(/Eve Stub/);

    fireEvent.click(screen.getByRole("button", { name: /show\/hide staff/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Alice Internal" }));

    expect(screen.queryByText(/Eve Stub/)).not.toBeInTheDocument();
    expect(screen.getByText(/Dee Client/)).toBeInTheDocument();
  });
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
