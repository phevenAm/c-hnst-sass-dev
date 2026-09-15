import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeleteClientModal from "./DeleteClientModal";

// Zero coverage before this file. deleteUser itself (the delete_user_by_id
// RPC + state update) is now covered at the slice level in
// userDirectorySlice.test.ts — this covers the modal's own job: dispatching
// it, waiting for it, and only closing once it actually succeeds.
//
// The failure-path tests below used to be a known, unfixed gap: handleConfirm
// had no try/catch, so a rejected delete left the modal open with zero
// feedback and an unhandled promise rejection. Now fixed (deleting/error
// state + try/catch) — these tests cover the fix.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockDispatch = vi.fn();
vi.mock("@store/hooks", () => ({ useAppDispatch: () => mockDispatch }));

vi.mock("@store/slices/userDirectorySlice", () => ({
  deleteUser: (id: string) => ({ type: "deleteUser", id }),
}));

describe("DeleteClientModal — happy path", () => {
  it("confirming dispatches deleteUser for this client and closes once it resolves", async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
    const onClose = vi.fn();
    render(<DeleteClientModal id="client-42" bodyText="Delete Ada Lovelace?" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    expect(mockDispatch).toHaveBeenCalledWith({ type: "deleteUser", id: "client-42" });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("DeleteClientModal — cancel", () => {
  it("closes without dispatching anything (sad path — confirms Cancel isn't a silent delete)", () => {
    const onClose = vi.fn();
    render(<DeleteClientModal id="client-42" bodyText="Delete Ada Lovelace?" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "cancel user deletion" }));

    expect(onClose).toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("DeleteClientModal — delete fails", () => {
  it("shows an error, does not close, and re-enables the buttons instead of failing silently", async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.reject(new Error("not part of your practice")) });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onClose = vi.fn();
    render(<DeleteClientModal id="client-42" bodyText="Delete Ada Lovelace?" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "confirm user deletion" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "cancel user deletion" })).toBeEnabled();
  });

  it("disables both buttons while the delete is in flight", () => {
    let resolveUnwrap: () => void = () => {};
    mockDispatch.mockReturnValue({ unwrap: () => new Promise<void>((res) => (resolveUnwrap = res)) });
    render(<DeleteClientModal id="client-42" bodyText="Delete Ada Lovelace?" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "confirm user deletion" }));

    expect(screen.getByRole("button", { name: "confirm user deletion" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel user deletion" })).toBeDisabled();

    resolveUnwrap();
  });
});
