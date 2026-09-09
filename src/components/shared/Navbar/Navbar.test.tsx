import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/__testUtils__/testUtils";
import Navbar from "./Navbar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const signOut = vi.fn();
const mockAuth = vi.fn();
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => mockAuth() }));
vi.mock("@context/EncryptionContext", () => ({ useEncryption: () => ({ status: "disabled" }) }));

const baseAuth = {
  isAdmin: false,
  isDemo: false,
  loading: false,
  signIn: vi.fn(),
  signOut,
  userProfile: { id: "u1", first_name: "John", last_name: "Doe" },
  displayName: "John",
};

describe("Navbar", () => {
  it("renders the client nav links for a client", () => {
    mockAuth.mockReturnValue({ ...baseAuth, isAdmin: false });
    renderWithProviders(<Navbar />);
    for (const label of ["Dashboard", "My sessions", "Check-in", "Resources"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("renders the admin nav links for an admin", () => {
    mockAuth.mockReturnValue({ ...baseAuth, isAdmin: true });
    renderWithProviders(<Navbar />);
    for (const label of ["Clients", "Schedule", "Finances", "Forms", "Resources", "CPD Log"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("calls signOut when the Sign out button is clicked", async () => {
    mockAuth.mockReturnValue({ ...baseAuth });
    renderWithProviders(<Navbar />);
    await userEvent.click(screen.getAllByRole("button", { name: "Sign out" })[0]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("links the logo home — /dashboard for a client, /admin for an admin", () => {
    mockAuth.mockReturnValue({ ...baseAuth, isAdmin: false });
    const { rerender } = renderWithProviders(<Navbar />);
    expect(screen.getByLabelText("Clarity — home")).toHaveAttribute("href", "/dashboard");

    mockAuth.mockReturnValue({ ...baseAuth, isAdmin: true });
    rerender(<Navbar />);
    expect(screen.getByLabelText("Clarity Admin — home")).toHaveAttribute("href", "/admin");
  });
});
