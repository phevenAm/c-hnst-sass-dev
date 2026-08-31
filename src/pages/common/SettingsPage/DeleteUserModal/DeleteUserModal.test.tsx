import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeleteUserModal from "./DeleteUserModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

const mockDispatch = vi.fn();
vi.mock("@store/hooks", () => ({ useAppDispatch: () => mockDispatch }));

// The real thunk isn't invoked (dispatch itself is mocked) — this just needs
// to exist as an importable action creator.
vi.mock("@store/slices/userDirectorySlice", () => ({
  deleteOwnAccount: (id: string) => ({ type: "deleteOwnAccount", id }),
}));

const mockInvoke = vi.fn();
vi.mock("@lib/supabase", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));

function setAuth(overrides: Partial<{ isAdmin: boolean }> = {}) {
  mockUseAuth.mockReturnValue({
    signOut: mockSignOut,
    userProfile: { id: "user-1" },
    isAdmin: false,
    ...overrides,
  });
}

describe("DeleteUserModal — happy paths", () => {
  it("admin: cancels billing, then deletes the account and signs out", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockResolvedValue({ data: { success: true, errors: [] }, error: null });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });

    render(<DeleteUserModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("cancel-billing-before-delete"));
    expect(mockDispatch).toHaveBeenCalledWith({ type: "deleteOwnAccount", id: "user-1" });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());

    // Billing cancel happened strictly before the account delete, not after —
    // otherwise practice_settings (which holds the Stripe IDs) is already gone.
    const invokeOrder = mockInvoke.mock.invocationCallOrder[0];
    const dispatchOrder = mockDispatch.mock.invocationCallOrder[0];
    expect(invokeOrder).toBeLessThan(dispatchOrder);
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

  it("admin: keeps the permanent-delete framing", () => {
    setAuth({ isAdmin: true });
    render(<DeleteUserModal onClose={vi.fn()} />);

    expect(screen.getByText("Delete your account forever?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirm user deletion" })).toHaveTextContent("Delete");
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
  it("admin: a failed billing cancellation doesn't block deletion (best-effort)", async () => {
    setAuth({ isAdmin: true });
    mockInvoke.mockResolvedValue({ data: null, error: new Error("Stripe is down") });
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<DeleteUserModal onClose={vi.fn()} />);
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

  it("disables both buttons while a deletion is in flight", async () => {
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
