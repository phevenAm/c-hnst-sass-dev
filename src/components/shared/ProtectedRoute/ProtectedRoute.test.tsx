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
  it("shows the error with both Try again and Sign out (happy path: both actions work)", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, profileError: "Couldn't load your profile." });

    render(
      <ProtectedRoute>
        <div>content</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Couldn't load your profile.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockRetryProfile).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
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
