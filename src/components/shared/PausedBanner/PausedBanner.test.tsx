import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import practiceSettingsReducer, { type PracticeSettingsCache } from "@store/slices/practiceSettingsSlice";

import PausedBanner from "./PausedBanner";

afterEach(cleanup);

const mockUseAuth = vi.fn(() => ({ isAdmin: false }));
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

function renderWithPausedState(isPaused: boolean | undefined, isAdmin = false) {
  mockUseAuth.mockReturnValue({ isAdmin });
  const store = configureStore({
    reducer: { practiceSettings: practiceSettingsReducer },
    preloadedState: {
      practiceSettings: {
        data: isPaused === undefined ? null : ({ is_paused: isPaused } as Partial<PracticeSettingsCache>),
        status: "succeeded" as const,
        error: null,
      },
    },
  });
  return render(
    <Provider store={store}>
      <PausedBanner />
    </Provider>,
  );
}

// This reads the shared practice_settings Redux cache directly (not
// useAuth().practiceSettings, which AuthContext deliberately keeps
// admin-only) so the same banner renders for a paused practice's clients too.
describe("PausedBanner", () => {
  it("shows the read-only banner when the practice is paused (happy path)", () => {
    renderWithPausedState(true);
    expect(screen.getByText(/this practice is paused/i)).toBeInTheDocument();
  });

  it("tells an admin they can resume it themselves from Settings (happy path)", () => {
    renderWithPausedState(true, true);
    expect(screen.getByText(/Settings → Billing/i)).toBeInTheDocument();
  });

  it("tells a client to contact their practitioner, not to look in Settings (sad path)", () => {
    renderWithPausedState(true, false);
    expect(screen.getByText(/contact them directly/i)).toBeInTheDocument();
    expect(screen.queryByText(/Settings → Billing/i)).not.toBeInTheDocument();
  });

  it("renders nothing when the practice is not paused (sad path)", () => {
    renderWithPausedState(false);
    expect(screen.queryByText(/this practice is paused/i)).not.toBeInTheDocument();
  });

  it("renders nothing before practice_settings has loaded (sad path)", () => {
    renderWithPausedState(undefined);
    expect(screen.queryByText(/this practice is paused/i)).not.toBeInTheDocument();
  });
});
