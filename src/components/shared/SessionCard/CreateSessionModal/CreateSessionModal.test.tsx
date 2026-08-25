import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import practiceSettingsReducer from "@store/slices/practiceSettingsSlice";
import sessionsReducer from "@store/slices/sessionsSlice";

import CreateSessionModal from "./CreateSessionModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ authUser: { id: "admin-1" }, isDemo: false }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// DateInput pulls in MUI X's date pickers, which need a LocalizationProvider
// this test has no reason to set up — irrelevant to what's under test here.
vi.mock("@components/shared/DateInput/DateInput", () => ({ default: () => <div /> }));

let packageRows: { id: string; name: string; price_pence: number; duration_minutes: number }[] = [
  { id: "pkg-1", name: "Standard session", price_pence: 6000, duration_minutes: 50 },
  { id: "pkg-2", name: "Extended session", price_pence: 9000, duration_minutes: 80 },
];

vi.mock("@/lib/supabase.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "session_packages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: packageRows, error: null }),
              }),
            }),
          }),
        };
      }
      // practice_settings — hit by useFetchOnIdle's shared-cache fetch on mount.
      return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      };
    },
  },
}));

function renderModal() {
  const store = configureStore({ reducer: { sessions: sessionsReducer, practiceSettings: practiceSettingsReducer } });
  return render(
    <Provider store={store}>
      <CreateSessionModal clientId="client-1" clientName="Ada Lovelace" onClose={vi.fn()} />
    </Provider>,
  );
}

// Session types configured in Settings (session_packages) previously had no
// way to be applied when actually booking a session — Settings' own copy
// promised "this is what you'll pick from when booking", which was false.
describe("CreateSessionModal — session type picker", () => {
  it("prefills duration and price when a session type is selected (happy path)", async () => {
    // Modal renders via a portal, so this is document.querySelector, not
    // container.querySelector — the latter only sees render()'s own root div.
    renderModal();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-2" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Session fee (£)")).toHaveValue(90);
    });
    expect(document.querySelector("#session-duration")).toHaveValue(80);
  });

  it("leaves duration and price editable after picking a type (happy path)", async () => {
    renderModal();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toHaveValue(60));

    fireEvent.change(screen.getByLabelText("Session fee (£)"), { target: { value: "45" } });
    expect(screen.getByLabelText("Session fee (£)")).toHaveValue(45);
  });

  it("does not show the picker when no session types are configured (sad path)", async () => {
    packageRows = [];
    renderModal();

    // Give the fetch effect a tick to resolve, then confirm no picker appeared.
    await waitFor(() => expect(document.querySelector("#session-duration")).toBeInTheDocument());
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
