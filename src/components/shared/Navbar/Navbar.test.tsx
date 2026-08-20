import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/__testUtils__/testUtils";
import Navbar from "./Navbar";

const DummyProfile = {
  id: "test-user-id",
  first_name: "John",
  last_name: "Doe",
};

const renderNavbar = () => renderWithProviders(<Navbar />, {});

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({
    isAdmin: false,
    isDemo: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    userProfile: DummyProfile,
    displayName: "Dummy Username",
  }),
}));

vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => ({ status: "disabled" }),
}));

describe("Navbar", () => {
  it("renders navigation links for client role", () => {
    renderNavbar();
    const logo = screen.getByTestId("logo-link");
    expect(logo).toBeVisible();
  });
  it.todo("renders navigation links for admin role");
  it.todo("calls signOut when logout is triggered");
  it.todo("toggles dark mode");
});
