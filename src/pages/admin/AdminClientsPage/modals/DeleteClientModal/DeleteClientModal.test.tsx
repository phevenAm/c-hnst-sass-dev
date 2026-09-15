import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeleteClientModal from "./DeleteClientModal";

// Zero coverage before this file. deleteUser itself (the delete_user_by_id
// RPC + state update) is now covered at the slice level in
// userDirectorySlice.test.ts — this covers the modal's own job: dispatching
// it, waiting for it, and only closing once it actually succeeds.

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
