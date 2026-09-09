import { MemoryRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

const baseAuth = {
  signIn: vi.fn(),
  loading: false,
  isAuthenticated: false,
  isAdmin: false,
  error: null as string | null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("renders email and password inputs", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth });
    renderPage();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submitting calls signIn with the entered credentials", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ ...baseAuth, signIn });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2!!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith("a@b.com", "hunter2!!"));
  });

  it("shows the auth error from context when credentials are invalid", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, error: "Invalid login credentials" });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid login credentials");
  });

  it("redirects a signed-in client to /dashboard and an admin to /admin", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, isAuthenticated: true, isAdmin: false });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });

    mockNavigate.mockClear();
    cleanup();
    mockUseAuth.mockReturnValue({ ...baseAuth, isAuthenticated: true, isAdmin: true });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });

  it("shows a full-screen loader (not the form) while auth is still loading", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, loading: true });
    renderPage();
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
  });

  it("keeps the submit button disabled until both fields are filled", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth });
    renderPage();
    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "a@b.com" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    expect(submit).toBeEnabled();
  });
});
