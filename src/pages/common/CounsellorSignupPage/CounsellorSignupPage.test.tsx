import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import themeReducer from "@store/slices/themeSlice";

import CounsellorSignupPage from "./CounsellorSignupPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// LeafLogoMark reads theme mode from Redux to pick the right variant.
function renderPage() {
  const store = configureStore({ reducer: { theme: themeReducer } });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CounsellorSignupPage />
      </MemoryRouter>
    </Provider>,
  );
}

const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));

const mockSignUp = vi.fn();
const mockResend = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signUp: (...args: unknown[]) => mockSignUp(...args), resend: (...args: unknown[]) => mockResend(...args) },
  },
}));

async function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Sarah" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Smith" } });
  fireEvent.change(screen.getByLabelText("Practice name"), { target: { value: "Sarah Smith Therapy" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "sarah@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  await screen.findByText("Check your email");
}

describe("CounsellorSignupPage — resend confirmation email", () => {
  it("shows the check-your-email screen after signup, and can resend (happy path)", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    mockResend.mockResolvedValue({ error: null });
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    renderPage();
    await fillAndSubmit();

    expect(screen.getByText(/sarah@example\.com/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    await waitFor(() => {
      expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "sarah@example.com" });
    });
    expect(await screen.findByText("Email sent — check your inbox.")).toBeInTheDocument();
  });

  it("shows a friendly error when resend fails, rather than throwing (sad path)", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    mockResend.mockResolvedValue({ error: new Error("rate limited") });
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    renderPage();
    await fillAndSubmit();

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));

    expect(await screen.findByText("Couldn't resend right now — please try again shortly.")).toBeInTheDocument();
  });

  it("disables the resend button while a request is in flight", async () => {
    mockSignUp.mockResolvedValue({ error: null });
    let resolveResend: (v: { error: null }) => void = () => {};
    mockResend.mockReturnValue(new Promise((res) => (resolveResend = res)));
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    renderPage();
    await fillAndSubmit();

    fireEvent.click(screen.getByRole("button", { name: "Resend the email" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    resolveResend({ error: null });
    await screen.findByRole("button", { name: "Resend the email" });
  });
});
