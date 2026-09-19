import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import agencyReducer from "@store/slices/agencySlice";

import IntakeClientModal from "./IntakeClientModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const { insertSpy, nextResult } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  nextResult: { value: { data: { id: "stub-1" }, error: null as unknown } },
}));
vi.mock("@/lib/supabase.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "client_stubs") throw new Error(`Unexpected table: ${table}`);
      return {
        insert: (payload: unknown) => {
          insertSpy(payload);
          return {
            select: () => ({
              single: () => Promise.resolve(nextResult.value),
            }),
          };
        },
      };
    },
  },
}));

function renderModal() {
  const store = configureStore({ reducer: { agency: agencyReducer } });
  const onClose = vi.fn();
  render(
    <Provider store={store}>
      <IntakeClientModal agencyId="agency-1" onClose={onClose} />
    </Provider>,
  );
  return { onClose };
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
}

describe("IntakeClientModal — rate lock checkbox", () => {
  it("hides the allow-custom-rate checkbox until a rate is entered (happy path)", () => {
    renderModal();
    expect(screen.queryByLabelText(/Allow the assigned staff member/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Default session rate/), { target: { value: "60" } });
    expect(screen.getByLabelText(/Allow the assigned staff member/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Default session rate/), { target: { value: "" } });
    expect(screen.queryByLabelText(/Allow the assigned staff member/)).not.toBeInTheDocument();
  });

  it("submits allow_staff_custom_rate: false by default (locked) when a rate is set (happy path)", async () => {
    const { onClose } = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Default session rate/), { target: { value: "60" } });

    fireEvent.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ default_rate_pence: 6000, allow_staff_custom_rate: false }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("submits allow_staff_custom_rate: true when the manager ticks the box (sad path — the override actually reaches the DB)", async () => {
    renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Default session rate/), { target: { value: "60" } });
    fireEvent.click(screen.getByLabelText(/Allow the assigned staff member/));

    fireEvent.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ allow_staff_custom_rate: true }));
  });

  it("submits allow_staff_custom_rate: false and a null rate when no rate is entered at all (regression — no rate means nothing to lock)", async () => {
    renderModal();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ default_rate_pence: null, allow_staff_custom_rate: false }),
    );
  });

  it("shows an error and does not close on a failed insert, without crashing (sad path)", async () => {
    nextResult.value = { data: null, error: { message: "boom" } };
    const { onClose } = renderModal();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Add client" }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
