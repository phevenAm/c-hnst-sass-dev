import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import practiceSettingsReducer, { type PracticeSettingsCache } from "@store/slices/practiceSettingsSlice";

import PausedBanner from "./PausedBanner";

afterEach(cleanup);

function renderWithPausedState(isPaused: boolean | undefined) {
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
    expect(screen.getByText(/this account is paused/i)).toBeInTheDocument();
  });

  it("renders nothing when the practice is not paused (sad path)", () => {
    renderWithPausedState(false);
    expect(screen.queryByText(/this account is paused/i)).not.toBeInTheDocument();
  });

  it("renders nothing before practice_settings has loaded (sad path)", () => {
    renderWithPausedState(undefined);
    expect(screen.queryByText(/this account is paused/i)).not.toBeInTheDocument();
  });
});
