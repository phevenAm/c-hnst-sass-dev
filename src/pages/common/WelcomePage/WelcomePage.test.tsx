import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import themeReducer from "@store/slices/themeSlice";

import WelcomePage from "./WelcomePage";

// LeafLogoMark (in AuthShell's header, wrapping every page here) reads theme
// mode from Redux to pick the right variant — needs a real store.
function renderPage() {
  const store = configureStore({ reducer: { theme: themeReducer } });
  return render(
    <Provider store={store}>
      <WelcomePage />
    </Provider>,
  );
}

// The post-checkout interstitial Stripe's success_url now lands on (instead
// of /admin directly) — confetti, a plan summary, and a "Get started" button
// that hands off to AdminSetupGate's real onboarding wizard (or /admin, for
// an already-onboarded admin re-subscribing after a lapse).

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

let authState: {
  practiceSettings: { subscription_plan: string; onboarding_required: boolean } | null;
  loading: boolean;
} = { practiceSettings: null, loading: true };
vi.mock("@context/AuthContext", () => ({ useAuth: () => authState }));

describe("WelcomePage", () => {
  it("renders nothing while practiceSettings is still loading", () => {
    authState = { practiceSettings: null, loading: true };
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the plan summary and 'Get started' for an admin who still needs onboarding", () => {
    authState = { practiceSettings: { subscription_plan: "growth", onboarding_required: true }, loading: false };
    renderPage();

    expect(screen.getByText("Thank you for subscribing to Clarity")).toBeInTheDocument();
    expect(screen.getByText("Growth")).toBeInTheDocument();
    expect(screen.getByText("15 active · 15 archived clients")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });

  it("'Get started' sends an onboarding-required admin to /admin/setup", () => {
    authState = { practiceSettings: { subscription_plan: "starter", onboarding_required: true }, loading: false };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/setup", { replace: true });
  });

  it("shows 'Go to dashboard' and sends an already-onboarded admin to /admin", () => {
    authState = { practiceSettings: { subscription_plan: "unlimited", onboarding_required: false }, loading: false };
    renderPage();

    const btn = screen.getByRole("button", { name: "Go to dashboard" });
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });
});
