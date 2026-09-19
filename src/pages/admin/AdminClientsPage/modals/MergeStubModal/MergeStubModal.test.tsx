import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClientStub, UserProfile } from "@/models/globalTypes";
import MergeStubModal from "./MergeStubModal";

// Zero coverage before this file, on a destructive/data-merging action whose
// server-side RPC (merge_stub_into_client) already had a real auth-bypass bug
// caught during a past security audit — the client side deserves the same
// scrutiny: does it send the right ids, resolve codename conflicts the way
// the admin actually chose, and refuse to treat a failed merge as done.

const { supabaseMock, rpcSpy, updateSpy, tableData } = vi.hoisted(() => {
  const tableData = {
    stubSessions: [] as Record<string, unknown>[],
    realSessions: [] as Record<string, unknown>[],
    // When true, the load effect's Promise.all never settles — lets a test
    // assert the synchronous "still loading" render state.
    pending: false,
  };
  const rpcSpy = vi.fn(() => Promise.resolve({ error: null }));
  const updateSpy = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  return {
    tableData,
    rpcSpy,
    updateSpy,
    supabaseMock: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null }) },
      rpc: rpcSpy,
      from: (table: string) => {
        if (table === "stub_sessions")
          return {
            select: () => ({
              eq: () => (tableData.pending ? new Promise(() => {}) : Promise.resolve({ data: tableData.stubSessions })),
            }),
          };
        if (table === "sessions")
          return {
            select: () => ({
              eq: () => (tableData.pending ? new Promise(() => {}) : Promise.resolve({ data: tableData.realSessions })),
            }),
          };
        if (table === "users") return { update: updateSpy };
        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

const mockUseAuth = vi.fn(() => ({
  isDemo: false,
  practiceSettings: null as { use_client_codenames?: boolean } | null,
}));
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockDispatch = vi.fn(() => Promise.resolve());
vi.mock("@/store/hooks", () => ({ useAppDispatch: () => mockDispatch }));
vi.mock("@/store/slices/clientStubsSlice", () => ({ fetchClientStubs: () => ({ type: "fetchClientStubs" }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  rpcSpy.mockImplementation(() => Promise.resolve({ error: null }));
});

beforeEach(() => {
  tableData.stubSessions = [];
  tableData.realSessions = [];
  tableData.pending = false;
  mockUseAuth.mockReturnValue({ isDemo: false, practiceSettings: null });
});

const stub = (over: Partial<ClientStub> = {}): ClientStub => ({
  id: "stub-1",
  created_by: "admin-1",
  linked_user_id: null,
  first_name: "Grace",
  last_name: "Hopper",
  email: null,
  codename: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const realUser = (over: Partial<UserProfile> = {}) =>
  ({
    id: "real-1",
    first_name: "Grace",
    last_name: "H",
    display_name: "Grace H",
    admin_codename: null,
    ...over,
  }) as UserProfile;

function confirmButton() {
  return screen.findByRole("button", { name: /confirm merge/i });
}

describe("MergeStubModal — happy path, no conflicts", () => {
  it("merges: calls the RPC with both ids, refreshes stubs, toasts, and reports merged", async () => {
    const onMerged = vi.fn();
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={onMerged} />);

    const btn = await confirmButton();
    expect(btn).toBeEnabled();
    fireEvent.click(btn);

    // onMerged is the last thing handleMerge does — waiting on it (rather than
    // on the rpc call, which fires synchronously before any of this settles)
    // guarantees the dispatch/toast assertions below run after they actually happened.
    await vi.waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(rpcSpy).toHaveBeenCalledWith("merge_stub_into_client", { p_stub_id: "stub-1", p_real_user_id: "real-1" });
    expect(mockDispatch).toHaveBeenCalledWith({ type: "fetchClientStubs" });
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining("merged into"));
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("with no offline sessions, says account data will be linked instead of quoting a session count", async () => {
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={vi.fn()} />);
    expect(await screen.findByText(/account data will be linked/i)).toBeInTheDocument();
  });

  it("with paid offline sessions, totals and reports the paid amount", async () => {
    tableData.stubSessions = [
      { id: "ss1", scheduled_at: "2026-01-05", amount_paid: 60 },
      { id: "ss2", scheduled_at: "2026-01-12", amount_paid: 40 },
    ];
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={vi.fn()} />);
    expect(await screen.findByText(/£100\.00 total/)).toBeInTheDocument();
  });
});

describe("MergeStubModal — codename conflict", () => {
  it("disables Confirm merge until the admin picks a side, then applies the chosen codename (sad path)", async () => {
    const admin = stub({ codename: "Falcon" });
    const client = realUser({ admin_codename: "Osprey" });
    render(<MergeStubModal stub={admin} realUser={client} onClose={vi.fn()} onMerged={vi.fn()} />);

    const btn = await confirmButton();
    expect(btn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: 'Use "Falcon"' }));
    expect(btn).toBeEnabled();
    fireEvent.click(btn);

    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ admin_codename: "Falcon" }));
    expect(rpcSpy).toHaveBeenCalledWith("merge_stub_into_client", { p_stub_id: "stub-1", p_real_user_id: "real-1" });
  });

  it("keeps the existing codename when the admin picks 'Keep' instead (confirms the choice actually branches, not just enables the button)", async () => {
    const admin = stub({ codename: "Falcon" });
    const client = realUser({ admin_codename: "Osprey" });
    render(<MergeStubModal stub={admin} realUser={client} onClose={vi.fn()} onMerged={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: 'Keep "Osprey"' }));
    fireEvent.click(await confirmButton());

    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ admin_codename: "Osprey" }));
  });

  it("carries the stub's codename over automatically when the real client has none (no conflict, no choice needed)", async () => {
    const admin = stub({ codename: "Falcon" });
    const client = realUser({ admin_codename: null });
    render(<MergeStubModal stub={admin} realUser={client} onClose={vi.fn()} onMerged={vi.fn()} />);

    const btn = await confirmButton();
    expect(btn).toBeEnabled();
    fireEvent.click(btn);

    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ admin_codename: "Falcon" }));
  });
});

describe("MergeStubModal — overlapping session dates", () => {
  it("flags dates that collide with an existing real session instead of merging silently", async () => {
    tableData.stubSessions = [{ id: "ss1", scheduled_at: "2026-01-05T10:00:00Z", amount_paid: null }];
    tableData.realSessions = [{ scheduled_at: "2026-01-05T09:00:00Z" }];
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={vi.fn()} />);

    expect(await screen.findByText(/Overlapping session dates/i)).toBeInTheDocument();
    expect(screen.getByText("5 Jan 2026")).toBeInTheDocument();
  });
});

describe("MergeStubModal — edge cases", () => {
  it("shows the codename-conflict box AND the overlapping-dates box together without either one hiding the other", async () => {
    const admin = stub({ codename: "Falcon" });
    const client = realUser({ admin_codename: "Osprey" });
    tableData.stubSessions = [{ id: "ss1", scheduled_at: "2026-01-05T10:00:00Z", amount_paid: null }];
    tableData.realSessions = [{ scheduled_at: "2026-01-05T09:00:00Z" }];
    render(<MergeStubModal stub={admin} realUser={client} onClose={vi.fn()} onMerged={vi.fn()} />);

    expect(await screen.findByText(/Codename conflict/i)).toBeInTheDocument();
    expect(screen.getByText(/Overlapping session dates/i)).toBeInTheDocument();
    // Both warnings gate the button independently — a resolved codename
    // conflict must not accidentally waive the merge for a still-unresolved reason.
    expect(await confirmButton()).toBeDisabled();
  });

  it("keeps Confirm merge disabled while the session/date lookup is still loading, even with no codename conflict at all (loading gate is independent of the conflict gate)", () => {
    tableData.pending = true;
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={vi.fn()} />);

    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm merge/i })).toBeDisabled();
  });
});

describe("MergeStubModal — demo mode", () => {
  it("blocks the merge and never calls the RPC (happy path — matches every other destructive demo guard)", async () => {
    mockUseAuth.mockReturnValue({ isDemo: true, practiceSettings: null });
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={vi.fn()} />);

    fireEvent.click(await confirmButton());

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i), "warning");
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe("MergeStubModal — RPC failure", () => {
  it("shows a failure toast, does not call onMerged, and re-enables the button (sad path — a failed merge must not look done)", async () => {
    rpcSpy.mockImplementationOnce(() => Promise.resolve({ error: { message: "constraint violation" } }));
    const onMerged = vi.fn();
    render(<MergeStubModal stub={stub()} realUser={realUser()} onClose={vi.fn()} onMerged={onMerged} />);

    const btn = await confirmButton();
    fireEvent.click(btn);

    await vi.waitFor(() => expect(mockShowToast).toHaveBeenCalledWith("Merge failed — please try again.", "danger"));
    expect(onMerged).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /confirm merge/i })).toBeEnabled();
  });
});
