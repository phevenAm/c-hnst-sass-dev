import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockRetryProfile = vi.fn();
const mockSignOut = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/admin" }),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
}));

// LeafLogoMark reads the Redux theme slice even when a color prop is passed —
// stub it out rather than wire up a store just for a decorative icon.
vi.mock("@components/shared/Icons/Icons", () => ({
  LeafLogoMark: () => <div data-testid="logo" />,
}));

const baseAuth = {
  isAuthenticated: true,
  isAdmin: true,
  loading: false,
  isFinishingSignup: false,
  userProfile: null,
  profileError: null as string | null,
  retryProfile: mockRetryProfile,
  signOut: mockSignOut,
};

describe("ProtectedRoute — profile load failure", () => {
  it("shows the error with both Try again and Sign in (happy path: both actions work)", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, profileError: "Couldn't load your profile." });

    render(
      <ProtectedRoute>
        <div>content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockRetryProfile).toHaveBeenCalled();

    // Labelled "Sign in" — that's where this actually lands the user — but
    // still just calls signOut() under the hood (ProtectedRoute redirects
    // to /login once isAuthenticated flips false).
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("does not render children while stuck on a profile error (sad path)", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, profileError: "Couldn't load your profile." });

    render(
      <ProtectedRoute>
        <div>content</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders children once the profile loads successfully", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, userProfile: { id: "admin-1", role: "admin" }, profileError: null });

    render(
      <ProtectedRoute>
        <div>content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
