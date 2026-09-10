import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import themeReducer from "@store/slices/themeSlice";

import SignUpPage from "./SignUpPage";

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

const baseAuth = { signUp: vi.fn(), loading: false, isAuthenticated: false, isAdmin: false };

function renderPage() {
  const store = configureStore({ reducer: { theme: themeReducer } });
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    </Provider>,
  );
  const $ = (id: string) => utils.container.querySelector(`#${id}`) as HTMLInputElement;
  return { ...utils, $ };
}

function fill($: (id: string) => HTMLInputElement, over: Partial<Record<string, string>> = {}) {
  const vals: Record<string, string> = {
    firstName: "Sam",
    lastName: "Lee",
    email: "sam@example.com",
    dob: "1990-06-15",
    accessToken: "TOKEN-123",
    password: "hunter2",
    confirm: "hunter2",
    ...over,
  };
  for (const [id, value] of Object.entries(vals)) fireEvent.change($(id), { target: { value } });
}

describe("SignUpPage", () => {
  it("renders every field, including the access token", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth });
    const { $ } = renderPage();
    for (const id of ["firstName", "lastName", "email", "dob", "accessToken", "password", "confirm"]) {
      expect($(id)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("blocks submit and shows an error when the passwords don't match — signUp is never called", async () => {
    const signUp = vi.fn();
    mockUseAuth.mockReturnValue({ ...baseAuth, signUp });
    const { $ } = renderPage();
    fill($, { confirm: "different" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/passwords do not match/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("submits with the token as the 4th arg when everything is valid", async () => {
    const signUp = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ ...baseAuth, signUp });
    const { $ } = renderPage();
    fill($);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        "sam@example.com",
        "hunter2",
        expect.objectContaining({ first_name: "Sam", last_name: "Lee", dob: "1990-06-15" }),
        "TOKEN-123",
      ),
    );
  });

  it("surfaces the error thrown by signUp (invalid / already-used token)", async () => {
    const signUp = vi.fn().mockRejectedValue(new Error("Invalid or already-used access token."));
    mockUseAuth.mockReturnValue({ ...baseAuth, signUp });
    const { $ } = renderPage();
    fill($);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or already-used access token/i);
  });

  it("redirects an already-authenticated visitor away from the form", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, isAuthenticated: true, isAdmin: false });
    renderPage();
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});
