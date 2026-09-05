import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeleteUserModal from "./DeleteUserModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

const mockDispatch = vi.fn();
// practice_settings cache — business_name drives the admin "type to confirm" phrase.
let mockPracticeSettings: { business_name?: string | null } | null = { business_name: "Willow Counselling" };
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ practiceSettings: { data: mockPracticeSettings } }),
}));

// The real thunk isn't invoked (dispatch itself is mocked) — this just needs
// to exist as an importable action creator.
vi.mock("@store/slices/userDirectorySlice", () => ({
  deleteOwnAccount: (id: string) => ({ type: "deleteOwnAccount", id }),
}));

const mockInvoke = vi.fn();
// `.from("session_notes")` is only reached when encryption is unlocked (see
// the mock below) — stub it so it can't throw if that path is ever exercised.
const mockFrom = vi.fn(() => ({
  select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
}));
vi.mock("@lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...(args as [])),
  },
}));

// Notes stay locked in tests, so handleExport sends an empty decrypted-notes map.
vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => ({ status: "locked", decryptNote: vi.fn() }),
}));

function setAuth(overrides: Partial<{ isAdmin: boolean }> = {}) {
  mockUseAuth.mockReturnValue({
    signOut: mockSignOut,
    userProfile: { id: "user-1" },
    isAdmin: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockPracticeSettings = { business_name: "Willow Counselling" };
});

// Walk an admin from the intro step to the type-to-confirm step and satisfy
// the confirmation input, so the final "Delete account" button is enabled.
function advanceAdminToArmedConfirm(phrase = "Willow Counselling") {
  fireEvent.click(screen.getByRole("button", { name: "continue to delete confirmation" }));
  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: phrase } });
}

describe("DeleteUserModal — happy paths", () => {
  it("admin: exports, then cancels billing, then deletes the account and signs out", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockImplementation((fn: string) => {
      if (fn === "export-practice-archive") {
        return Promise.resolve({
          data: { data_base64: btoa("zip-bytes"), filename: "clarity-export-2026-09-04.zip" },
          error: null,
        });
      }
      return Promise.resolve({ data: { success: true, errors: [] }, error: null });
    });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    // jsdom has no real object-URL / anchor download plumbing.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "continue to delete confirmation" }));

    fireEvent.click(screen.getByRole("button", { name: "Export my data" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("export-practice-archive", { body: { decrypted_notes: {} } }),
    );
    expect(await screen.findByText(/Downloaded clarity-export-2026-09-04\.zip/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "willow counselling" } }); // case-insensitive
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cancel-billing-before-delete"));
    expect(mockDispatch).toHaveBeenCalledWith({ type: "deleteOwnAccount", id: "user-1" });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());

    // Billing cancel happened strictly before the account delete, not after —
    // otherwise practice_settings (which holds the Stripe IDs) is already gone.
    const billingOrder = mockInvoke.mock.calls.findIndex((c) => c[0] === "cancel-billing-before-delete");
    const billingInvocation = mockInvoke.mock.invocationCallOrder[billingOrder];
    const dispatchOrder = mockDispatch.mock.invocationCallOrder[0];
    expect(billingInvocation).toBeLessThan(dispatchOrder);
  });

  it("admin: can delete without exporting first (export is offered, not forced)", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockResolvedValue({ data: { success: true, errors: [] }, error: null });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });

    render(<DeleteUserModal onClose={vi.fn()} />);
    advanceAdminToArmedConfirm();
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalledWith("export-practice-archive", expect.anything());
  });

  it("client: skips the billing-cancel call entirely, just deletes and signs out", async () => {
    setAuth({ isAdmin: false });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("client: frames it as closing the account and explains the practitioner keeps an anonymised record", () => {
    setAuth({ isAdmin: false });
    render(<DeleteUserModal onClose={vi.fn()} />);

    expect(screen.getByText("Close your account?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirm user deletion" })).toHaveTextContent("Close account");
    expect(screen.getByText(/anonymised record of your sessions and payments/i)).toBeInTheDocument();
    expect(screen.getByText(/won't be able to sign in again/i)).toBeInTheDocument();
  });

  it("admin: intro step spells out that it's permanent and points at pausing instead", () => {
    setAuth({ isAdmin: true });
    render(<DeleteUserModal onClose={vi.fn()} />);

    expect(screen.getByText("Delete your account forever?")).toBeInTheDocument();
    expect(screen.getByText(/permanent and immediate/i)).toBeInTheDocument();
    expect(screen.getByText(/pause your practice instead/i)).toBeInTheDocument();
    // No delete trigger on the intro step — only "Continue".
    expect(screen.queryByRole("button", { name: "confirm user deletion" })).not.toBeInTheDocument();
  });

  it("Cancel closes the modal without deleting anything", () => {
    setAuth();
    const onClose = vi.fn();
    render(<DeleteUserModal onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "cancel user deletion" }));

    expect(onClose).toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("DeleteUserModal — sad paths", () => {
  it("admin: the Delete button stays disabled until the practice name is typed correctly", () => {
    setAuth({ isAdmin: true });
    render(<DeleteUserModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "continue to delete confirmation" }));
    const del = screen.getByRole("button", { name: "confirm user deletion" });
    expect(del).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "wrong name" } });
    expect(del).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "Willow Counselling" } });
    expect(del).toBeEnabled();
  });

  it("admin with no practice name: confirmation phrase falls back to DELETE", () => {
    setAuth({ isAdmin: true });
    mockPracticeSettings = { business_name: null };
    render(<DeleteUserModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "continue to delete confirmation" }));
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DELETE" } });
    expect(screen.getByRole("button", { name: "confirm user deletion" })).toBeEnabled();
  });

  it("admin: a failed export surfaces an error and does not block deletion", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockImplementation((fn: string) => {
      if (fn === "export-practice-archive") return Promise.resolve({ data: null, error: new Error("boom") });
      return Promise.resolve({ data: { success: true }, error: null });
    });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "continue to delete confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Export my data" }));

    expect(await screen.findByText(/Couldn't build the export/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "Willow Counselling" } });
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("admin: a failed billing cancellation doesn't block deletion (best-effort)", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockImplementation((fn: string) => {
      if (fn === "cancel-billing-before-delete")
        return Promise.resolve({ data: null, error: new Error("Stripe is down") });
      return Promise.resolve({ data: {}, error: null });
    });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<DeleteUserModal onClose={vi.fn()} />);
    advanceAdminToArmedConfirm();
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(consoleSpy).toHaveBeenCalledWith("Failed to cancel billing before account deletion", expect.anything());
    consoleSpy.mockRestore();
  });

  it("shows an error and does not sign out when the delete itself fails", async () => {
    setAuth();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.reject(new Error("db exploded")) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("disables both buttons while a deletion is in flight (client)", async () => {
    setAuth();
    let resolveUnwrap: () => void = () => {};
    mockDispatch.mockReturnValue({ unwrap: () => new Promise<void>((res) => (resolveUnwrap = res)) });

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    expect(screen.getByRole("button", { name: "confirm user deletion" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel user deletion" })).toBeDisabled();

    resolveUnwrap();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
