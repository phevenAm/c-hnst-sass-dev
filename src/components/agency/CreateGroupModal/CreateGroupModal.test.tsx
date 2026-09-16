import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import groupsReducer from "@store/slices/groupsSlice";

import CreateGroupModal from "./CreateGroupModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const { insertSpy, nextResult } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  nextResult: { value: { data: { id: "group-1", name: "Tuesday group" }, error: null as unknown } },
}));
vi.mock("@/lib/supabase.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "groups") throw new Error(`Unexpected table: ${table}`);
      return {
        insert: (payload: unknown) => {
          insertSpy(payload);
          return { select: () => ({ single: () => Promise.resolve(nextResult.value) }) };
        },
      };
    },
  },
}));

function renderModal() {
  const store = configureStore({ reducer: { groups: groupsReducer } });
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <CreateGroupModal agencyId="agency-1" onClose={onClose} />
    </Provider>,
  );
  return { onClose };
}

describe("CreateGroupModal", () => {
  it("disables the create button until a name is entered", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Tuesday group" } });
    expect(screen.getByRole("button", { name: "Create group" })).not.toBeDisabled();
  });

  it("submits agency_id, trimmed name, and a null description when left blank (happy path)", async () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "  Tuesday group  " } });

    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith({
      agency_id: "agency-1",
      name: "Tuesday group",
      description: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("includes a trimmed description when provided", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Tuesday group" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "  For anxiety  " } });

    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "For anxiety" }));
  });

  it("shows the real DB error and does not close on a failed insert (sad path — getErrorMessage regression)", async () => {
    nextResult.value = { data: null, error: { message: "duplicate group name" } };
    const { onClose } = renderModal();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Tuesday group" } });

    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    expect(await screen.findByText("duplicate group name")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
