import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "./SettingsPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Mocks ──────────────────────────────────────────────────────────────────
//
// These are the settings that flow through to the client-facing app, not
// just the admin's own UI: bank details (shown in the client PaymentModal),
// auto-cancel + payment deadline (cancels the client's session and emails
// them), the reschedule/cancellation cutoff (gates what a client can do to
// their own booking), client consent (blocks app access until agreed), and
// which transactional emails actually go out to clients.

const defaultUserProfile = {
  id: "admin-1",
  display_name: "Admin User",
  first_name: "Admin",
  avatar_url: "",
  focus_keywords: [],
  role: "admin",
};

const defaultAuthValue = {
  userProfile: defaultUserProfile,
  updateProfile: vi.fn(),
  isAdmin: true,
  isDemo: false,
  loading: false,
  practiceSettings: { subscription_status: "active", subscription_plan: "pro" },
  refreshPracticeSettings: vi.fn(),
};

const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// clearAllMocks (in the global afterEach) wipes call history but not a
// standing mockImplementation, so re-arm the default before every test —
// otherwise a test that overrides loading/userProfile would leak into the next one.
beforeEach(() => {
  mockUseAuth.mockImplementation(() => defaultAuthValue);
});

vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => ({
    status: "disabled",
    encryptPII: async (v: string) => v,
    decryptPII: async (v: string) => v,
  }),
}));

vi.mock("@context/InterfacePrefsContext", () => ({
  useInterfacePrefs: () => ({
    hiddenSections: [],
    toggleSection: vi.fn(),
    reduceMotion: false,
    setReduceMotion: vi.fn(),
  }),
}));

vi.mock("@context/WalkthroughContext", () => ({
  useWalkthrough: () => ({ resetAll: vi.fn(), isDismissedGlobally: true }),
}));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const { supabaseMock, updateSpy, initialRow } = vi.hoisted(() => {
  const initialRow = {
    business_name: "",
    email: "",
    phone: "",
    address: "",
    logo_url: "",
    bank_name: "",
    bank_account_name: "",
    bank_sort_code: "",
    bank_account_number: "",
    bank_payment_reference: "",
    stripe_connect_onboarded: false,
    billing_customer_id: null,
    reminder_hours_before: 120,
    reminder_email_subject: "",
    reminder_email_body: "",
    reminder_email_heading: "",
    disabled_email_types: [] as string[],
    payment_deadline_hours: 48,
    use_client_codenames: false,
    auto_cancel_enabled: false,
    reschedule_cutoff_hours: 48,
    consent_enabled: false,
    consent_title: "Before you continue",
    consent_body: "",
    consent_pdf_url: "",
    consent_counsellor_cta: "If you have any questions, speak to your counsellor.",
  };
  const updateSpy = vi.fn();
  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table !== "practice_settings") throw new Error(`Unexpected table in test: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: initialRow, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateSpy(payload);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    }),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabaseMock, updateSpy, initialRow };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function openPracticeTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Practice" }));
  // wait for the initial practice_settings fetch to populate the form
  await waitFor(() => expect(getFieldInput("Bank name")).toHaveValue(initialRow.bank_name));
}

async function openEmailsTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Emails" }));
  await screen.findByText("Manage emails");
}

function getEmailRowToggle(templateLabel: string) {
  const header = screen.getByText(templateLabel).closest("button")?.parentElement;
  if (!header) throw new Error(`Could not find the email row for "${templateLabel}"`);
  return within(header).getByRole("checkbox");
}

// Business/bank fields render a bare <label> sibling to its <input> — no
// htmlFor/id pairing — so getByLabelText can't resolve them accessibly.
function getFieldInput(labelText: string): HTMLInputElement {
  const input = screen.getByText(labelText).closest("div")?.querySelector("input");
  if (!input) throw new Error(`Could not find the input for field "${labelText}"`);
  return input as HTMLInputElement;
}

// Several Practice-tab cards each have their own plain "Save" button — scope
// to the card under its <h2> so we click the right one.
function getCardByHeading(headingText: string): HTMLElement {
  const card = screen.getByRole("heading", { name: headingText }).closest("section")?.parentElement;
  if (!card) throw new Error(`Could not find the card for heading "${headingText}"`);
  return card as HTMLElement;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SettingsPage — loading", () => {
  it("shows a spinner instead of the form while auth is still loading", () => {
    mockUseAuth.mockImplementation(() => ({
      ...defaultAuthValue,
      userProfile: null,
      loading: true,
      practiceSettings: null,
    }));
    render(<SettingsPage />);
    expect(screen.queryByRole("button", { name: "Practice" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — bank details (client payment info)", () => {
  it("saves a changed bank account number", async () => {
    await openPracticeTab();

    fireEvent.change(getFieldInput("Account number"), { target: { value: "87654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bank details" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ bank_account_number: "87654321" }));
    });
  });
});

describe("SettingsPage — session automation (auto-cancel unpaid sessions)", () => {
  it("turns auto-cancel on with a chosen deadline and saves it", async () => {
    await openPracticeTab();

    fireEvent.click(screen.getByRole("checkbox", { name: /auto-cancel unpaid sessions/i }));
    fireEvent.change(screen.getByLabelText("Cutoff period"), { target: { value: "168" } });
    fireEvent.click(within(getCardByHeading("Session automation")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ auto_cancel_enabled: true, payment_deadline_hours: 168 }),
      );
    });
  });
});

describe("SettingsPage — reschedule & cancellation cutoff", () => {
  it("turning the cutoff off clears reschedule_cutoff_hours so clients can act right up to session start", async () => {
    await openPracticeTab();

    // Fetched practice_settings has reschedule_cutoff_hours: 48 (not null), so the
    // toggle loads on — switch it off and save.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /enforce a cutoff/i })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: /enforce a cutoff/i }));

    fireEvent.click(within(getCardByHeading("Reschedule & cancellation cutoff")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ reschedule_cutoff_hours: null });
    });
  });
});

describe("SettingsPage — client consent", () => {
  it("enables the consent gate and saves the agreement text", async () => {
    await openPracticeTab();

    fireEvent.click(screen.getByRole("checkbox", { name: /require consent before app access/i }));
    fireEvent.change(screen.getByLabelText(/agreement text/i), {
      target: { value: "By continuing you agree to our confidentiality policy." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save consent settings" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          consent_enabled: true,
          consent_body: "By continuing you agree to our confidentiality policy.",
        }),
      );
    });
  });
});

describe("SettingsPage — client-facing emails", () => {
  it("pausing the session-cancelled email and saving records it in disabled_email_types", async () => {
    await openEmailsTab();

    fireEvent.click(getEmailRowToggle("Session cancelled"));
    fireEvent.click(screen.getByRole("button", { name: "Save email settings" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ disabled_email_types: ["session_cancelled"] }));
    });
  });
});
