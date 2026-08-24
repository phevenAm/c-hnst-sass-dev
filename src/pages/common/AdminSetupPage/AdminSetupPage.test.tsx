import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminSetupPage from "./AdminSetupPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockSignOut = vi.fn();
const mockRefreshPracticeSettings = vi.fn();
vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    userProfile: { id: "admin-1" },
    practiceSettings: { business_name: null },
    refreshPracticeSettings: mockRefreshPracticeSettings,
    signOut: mockSignOut,
  }),
}));

const { supabaseMock, packagesRows, updateSpy } = vi.hoisted(() => {
  const packagesRows: { id: string; name: string; price_pence: number; duration_minutes: number }[] = [];
  const updateSpy = vi.fn();
  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table === "session_packages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: packagesRows, error: null }),
              }),
            }),
          }),
          insert: (payload: { name: string; price_pence: number; duration_minutes: number }) => ({
            select: () => ({
              single: () => {
                const row = { id: `pkg-${packagesRows.length + 1}`, ...payload };
                packagesRows.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
          update: (payload: { archived: boolean }) => ({
            eq: (_col: string, id: string) => {
              if (payload.archived) {
                const idx = packagesRows.findIndex((p) => p.id === id);
                if (idx !== -1) packagesRows.splice(idx, 1);
              }
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "practice_settings") {
        return {
          update: (payload: Record<string, unknown>) => {
            updateSpy(payload);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  };
  return { supabaseMock, packagesRows, updateSpy };
});
vi.mock("@lib/supabase", () => ({ supabase: supabaseMock }));

beforeEach(() => {
  packagesRows.length = 0;
});

async function addPackage(name: string, price: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: price } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  await screen.findByText(name, { exact: false });
}

describe("AdminSetupPage — happy path", () => {
  it("adds a session package and shows it in the list", async () => {
    render(<AdminSetupPage />);
    await addPackage("Standard session", "60.00");

    expect(screen.getByText(/Standard session/)).toBeInTheDocument();
    expect(screen.getByText(/£60\.00/)).toBeInTheDocument();
  });

  it("completes setup once business name and a package are both present, then redirects", async () => {
    render(<AdminSetupPage />);
    await addPackage("Standard session", "60.00");
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sarah Smith Therapy" } });

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ business_name: "Sarah Smith Therapy", onboarding_required: false });
    });
    await waitFor(() => expect(mockRefreshPracticeSettings).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });

  it("removing a package takes it out of the list", async () => {
    render(<AdminSetupPage />);
    await addPackage("Standard session", "60.00");

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText(/Standard session/)).not.toBeInTheDocument());
  });
});

describe("AdminSetupPage — sad paths", () => {
  it("blocks Finish and shows an error when business name is empty", async () => {
    render(<AdminSetupPage />);
    await addPackage("Standard session", "60.00");
    // business name left blank

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByText("Business name is required.")).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("blocks Finish and shows an error when no session package has been added", async () => {
    render(<AdminSetupPage />);
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Sarah Smith Therapy" } });

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(
      await screen.findByText("Add at least one session type with a price before continuing."),
    ).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("the + Add button stays disabled until both a name and a price are entered", () => {
    render(<AdminSetupPage />);
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standard session" } });
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();
  });
});
