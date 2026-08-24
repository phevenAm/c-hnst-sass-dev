import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import themeReducer from "@store/slices/themeSlice";

import AdminSetupPage from "./AdminSetupPage";

// LeafLogoMark (used in the page header, matching the rest of the auth
// funnel) reads theme mode from Redux to pick the right variant.
function renderPage() {
  const store = configureStore({ reducer: { theme: themeReducer } });
  return render(
    <Provider store={store}>
      <AdminSetupPage />
    </Provider>,
  );
}

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
    userProfile: { id: "admin-1", first_name: "Sarah" },
    practiceSettings: { business_name: null },
    refreshPracticeSettings: mockRefreshPracticeSettings,
    signOut: mockSignOut,
  }),
}));

vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => ({ status: "disabled", encryptPII: async (v: string) => v }),
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

// Step 1 -> fills business name and continues to step 2.
function goToStep2(businessName = "Sarah Smith Therapy") {
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: businessName } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

// Step 2 -> adds one package and continues to step 3.
async function addPackageAndGoToStep3(name = "Standard session", price = "60.00") {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: price } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  await screen.findByText(name, { exact: false });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

// Full happy-path walk from step 1 to step 3 (bank details), business name +
// one package filled in, landing on the last step ready to Finish.
async function walkToStep3() {
  renderPage();
  goToStep2();
  await addPackageAndGoToStep3();
  await screen.findByLabelText("Bank name");
}

describe("AdminSetupPage — staged flow (happy path)", () => {
  it("shows step 1 (business info) first, with Continue disabled until a name is entered", () => {
    renderPage();
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("moves through all three steps and lands on Finish setup", async () => {
    await walkToStep3();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("Back returns to the previous step without losing what was entered", async () => {
    renderPage();
    goToStep2();
    await addPackageAndGoToStep3();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText(/Standard session/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Business name")).toHaveValue("Sarah Smith Therapy");
  });

  it("completes setup once all steps are done, then redirects", async () => {
    await walkToStep3();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ business_name: "Sarah Smith Therapy", onboarding_required: false }),
      );
    });
    await waitFor(() => expect(mockRefreshPracticeSettings).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });

  it("bank details are optional — completes setup fine when left blank", async () => {
    await walkToStep3();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/admin"));
  });

  it("saves bank details when filled in", async () => {
    await walkToStep3();
    fireEvent.change(screen.getByLabelText("Bank name"), { target: { value: "Barclays" } });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "12345678" } });

    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ bank_name: "Barclays", bank_account_number: "12345678" }),
      );
    });
  });

  it("removing a package on step 2 takes it out of the list", async () => {
    renderPage();
    goToStep2();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standard session" } });
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "60.00" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    await screen.findByText(/Standard session/);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText(/Standard session/)).not.toBeInTheDocument());
  });
});

describe("AdminSetupPage — staged flow (sad paths)", () => {
  it("blocks Continue and shows an error when business name is empty on step 1", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Business name is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toBeInTheDocument(); // still on step 1
  });

  it("blocks Continue and shows an error when no session package has been added on step 2", () => {
    renderPage();
    goToStep2();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Add at least one session type with a price before continuing.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument(); // still on step 2
  });

  it("the + Add button stays disabled until both a name and a price are entered", () => {
    renderPage();
    goToStep2();
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standard session" } });
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();
  });
});
