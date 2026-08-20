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
  Object.assign(currentRow, initialRow);
  setGoogleStatusRow(null);
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

const { supabaseMock, updateSpy, initialRow, currentRow, invokeSpy, setGoogleStatusRow } = vi.hoisted(() => {
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
  // Mutable copy the mock reads from — tests can tweak fields (e.g.
  // stripe_connect_onboarded) before rendering without touching the defaults.
  const currentRow: typeof initialRow = { ...initialRow };
  let googleStatusRow: { connected: boolean; google_email: string | null; sync_enabled: boolean } | null = null;
  const updateSpy = vi.fn();
  const invokeSpy = vi.fn((fnName: string) =>
    Promise.resolve({ data: { url: `https://example.com/${fnName}` }, error: null }),
  );
  const rpcSpy = vi.fn((fnName: string) => {
    if (fnName === "get_google_calendar_status") {
      return Promise.resolve({ data: googleStatusRow ? [googleStatusRow] : [], error: null });
    }
    return Promise.resolve({ data: [], error: null });
  });
  const supabaseMock = {
    from: vi.fn((table: string) => {
      if (table !== "practice_settings") throw new Error(`Unexpected table in test: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: currentRow, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateSpy(payload);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    }),
    rpc: rpcSpy,
    functions: { invoke: invokeSpy },
  };
  return {
    supabaseMock,
    updateSpy,
    initialRow,
    currentRow,
    invokeSpy,
    setGoogleStatusRow: (row: typeof googleStatusRow) => {
      googleStatusRow = row;
    },
  };
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

async function openInterfaceTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Interface" }));
  await screen.findByText("Use codenames");
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

  it("sends a test email for the reminder template", async () => {
    await openEmailsTab();

    fireEvent.click(screen.getByText("Session reminder"));
    fireEvent.click(await screen.findByRole("button", { name: "Send test to me" }));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith(
        "send-test-email",
        expect.objectContaining({ body: expect.objectContaining({ type: "reminder" }) }),
      );
    });
  });
});

describe("SettingsPage — profile", () => {
  it("updates the display name", async () => {
    render(<SettingsPage />);

    const nameInput = screen.getByLabelText(/display name/i);
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Update profile" }));

    await waitFor(() => {
      expect(defaultAuthValue.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: "New Name" }),
      );
    });
  });
});

describe("SettingsPage — business information", () => {
  it("saves changed business details", async () => {
    await openPracticeTab();

    fireEvent.change(getFieldInput("Business name"), { target: { value: "Clarity Counselling" } });
    fireEvent.click(
      within(getCardByHeading("Business information")).getByRole("button", { name: "Save business info" }),
    );

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ business_name: "Clarity Counselling" }));
    });
  });
});

describe("SettingsPage — Stripe Connect", () => {
  it("shows a connect button when Stripe isn't linked yet", async () => {
    await openPracticeTab();
    expect(screen.getByRole("button", { name: "Connect Stripe account" })).toBeInTheDocument();
  });

  it("shows a connected message once Stripe is linked", async () => {
    currentRow.stripe_connect_onboarded = true;
    await openPracticeTab();
    expect(screen.getByText("Stripe connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Stripe account" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — Google Calendar sync", () => {
  it("shows a connect button when no calendar is linked", async () => {
    await openPracticeTab();
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument();
  });

  it("pauses sync for an already-connected calendar", async () => {
    setGoogleStatusRow({ connected: true, google_email: "admin@example.com", sync_enabled: true });
    await openPracticeTab();

    const syncToggle = await screen.findByRole("checkbox", { name: /sync to google calendar/i });
    fireEvent.click(syncToggle);

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("set_google_calendar_sync_enabled", { p_enabled: false });
    });
  });

  it("disconnects Google Calendar after confirming", async () => {
    setGoogleStatusRow({ connected: true, google_email: "admin@example.com", sync_enabled: true });
    await openPracticeTab();

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google Calendar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, disconnect" }));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("google-calendar-disconnect");
    });
  });
});

describe("SettingsPage — subscription", () => {
  it("opens the Stripe billing portal", async () => {
    currentRow.billing_customer_id = "cus_123";
    await openPracticeTab();

    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("create-billing-portal-session");
    });
  });
});

describe("SettingsPage — interface preferences", () => {
  it("saves the client codenames setting", async () => {
    await openInterfaceTab();

    fireEvent.click(screen.getByRole("checkbox", { name: /use codenames/i }));
    fireEvent.click(within(getCardByHeading("Clients")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ use_client_codenames: true }));
    });
  });

  it("moves the sidebar expand button and persists the choice", async () => {
    await openInterfaceTab();

    fireEvent.click(screen.getByRole("button", { name: "Bottom" }));

    expect(localStorage.getItem("adminSidebarBtnPos")).toBe("bottom");
  });
});
