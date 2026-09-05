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

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
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

// PdfViewer eagerly imports pdf.js, which touches DOMMatrix — unavailable in
// jsdom. Stubbed the same way ConsentModal.test.tsx does; this file cares
// about the agreement-gate logic, not PDF rendering.
vi.mock("@components/shared/PdfViewer/PdfViewer", () => ({
  default: ({ title }: { title: string }) => <div data-testid="pdf-viewer">{title}</div>,
}));

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
      expect(mockResend).toHaveBeenCalledWith({
        type: "signup",
        email: "sarah@example.com",
        options: { emailRedirectTo: expect.stringContaining("/login") },
      });
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

describe("CounsellorSignupPage — confirmation gates access before the subscribe page", () => {
  it("stays on the check-your-email screen and never navigates while unconfirmed (happy path)", async () => {
    // The real Supabase behaviour with "Confirm email" on: signUp() succeeds
    // but grants no session, so isAuthenticated stays false until the link
    // is actually clicked — this is what stops CounsellorSignupPage's own
    // isAuthenticated effect (which sends people to /admin, and from there
    // SubscriptionGate on to /subscribe) from firing early.
    mockSignUp.mockResolvedValue({ error: null });
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });

    renderPage();
    await fillAndSubmit();

    expect(screen.getByText("Check your email")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to /admin only once isAuthenticated actually becomes true (sad path: confirms the gate isn't just decorative)", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    const { rerender } = render(
      <Provider store={configureStore({ reducer: { theme: themeReducer } })}>
        <MemoryRouter>
          <CounsellorSignupPage />
        </MemoryRouter>
      </Provider>,
    );
    expect(mockNavigate).not.toHaveBeenCalled();

    // Simulate returning from the confirmation link and logging in.
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    rerender(
      <Provider store={configureStore({ reducer: { theme: themeReducer } })}>
        <MemoryRouter>
          <CounsellorSignupPage />
        </MemoryRouter>
      </Provider>,
    );

    expect(mockNavigate).toHaveBeenCalledWith("/admin", { replace: true });
  });
});
