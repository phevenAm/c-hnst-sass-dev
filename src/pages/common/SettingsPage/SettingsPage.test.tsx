import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "./SettingsPage";

// SettingsPage reads ?tab= via useSearchParams; the page is rendered here
// without a Router, so stub the hook.
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

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

// The page is rendered without a redux <Provider>; store access is the
// Appearance control's theme preference and the pause card's is_paused flag.
// Run each selector against a small fake state built from currentRow.
const mockDispatch = vi.fn();
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { mode: "system" }, practiceSettings: { data: currentRow } }),
}));
vi.mock("@Hooks/useResolvedTheme", () => ({
  useResolvedTheme: () => "light",
}));

// clearAllMocks (in the global afterEach) wipes call history but not a
// standing mockImplementation, so re-arm the default before every test —
// otherwise a test that overrides loading/userProfile would leak into the next one.
beforeEach(() => {
  mockUseAuth.mockImplementation(() => defaultAuthValue);
  Object.assign(currentRow, initialRow);
  setGoogleStatusRow(null);
  reminderMutesRows.length = 0;
  sessionPackagesRows.length = 0;
});

vi.mock("@context/EncryptionContext", () => ({
  useEncryption: () => ({
    status: "disabled",
    encryptPII: async (v: string) => v,
    decryptPII: async (v: string) => v,
  }),
}));

vi.mock("@context/InterfacePrefsContext", () => ({
  APP_ZOOM_LEVELS: [0.5, 0.75, 1, 1.25, 1.5],
  useInterfacePrefs: () => ({
    hiddenSections: [],
    toggleSection: vi.fn(),
    reduceMotion: false,
    setReduceMotion: vi.fn(),
    appZoom: 1,
    setAppZoom: vi.fn(),
  }),
}));

vi.mock("@context/WalkthroughContext", () => ({
  useWalkthrough: () => ({ resetAll: vi.fn(), isDismissedGlobally: true }),
}));

const mockShowToast = vi.fn();
vi.mock("@context/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const {
  supabaseMock,
  updateSpy,
  initialRow,
  currentRow,
  invokeSpy,
  setGoogleStatusRow,
  reminderMutesRows,
  sessionPackagesRows,
  clientOptionsRows,
  stubOptionsRows,
} = vi.hoisted(() => {
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
    is_paused: false,
    auto_cancel_enabled: false,
    reschedule_cutoff_hours: 48,
    consent_enabled: false,
    consent_title: "Before you continue",
    consent_body: "",
    consent_pdf_url: "",
    consent_counsellor_cta: "If you have any questions, speak to your counsellor.",
    admin_reminders_enabled: true,
    admin_reminder_lead_minutes: 1440,
  };
  // Mutable copy the mock reads from — tests can tweak fields (e.g.
  // stripe_connect_onboarded) before rendering without touching the defaults.
  const currentRow: typeof initialRow = { ...initialRow };
  let googleStatusRow: { connected: boolean; google_email: string | null; sync_enabled: boolean } | null = null;
  const reminderMutesRows: { id: string; client_id: string | null; stub_id: string | null }[] = [];
  const sessionPackagesRows: {
    id: string;
    name: string;
    price_pence: number;
    duration_minutes: number;
    is_recurring?: boolean;
    session_count?: number;
  }[] = [];
  const clientOptionsRows: { id: string; first_name: string; last_name: string }[] = [
    { id: "client-1", first_name: "Ada", last_name: "Lovelace" },
  ];
  const stubOptionsRows: { id: string; first_name: string; last_name: string; codename: string | null }[] = [
    { id: "stub-1", first_name: "Grace", last_name: "Hopper", codename: null },
  ];
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
      if (table === "session_packages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: sessionPackagesRows, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                const row = {
                  id: `pkg-${sessionPackagesRows.length + 1}`,
                  is_recurring: false,
                  session_count: 1,
                  ...payload,
                };
                sessionPackagesRows.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
          update: () => ({
            eq: (_col: string, id: string) => {
              const idx = sessionPackagesRows.findIndex((p) => p.id === id);
              if (idx !== -1) sessionPackagesRows.splice(idx, 1);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "admin_reminder_mutes") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: reminderMutesRows, error: null }),
          }),
          insert: (payload: { client_id: string | null; stub_id: string | null }) => ({
            select: () => ({
              single: () => {
                const row = {
                  id: `mute-${reminderMutesRows.length + 1}`,
                  client_id: payload.client_id,
                  stub_id: payload.stub_id,
                };
                reminderMutesRows.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              const idx = reminderMutesRows.findIndex((m) => m.id === id);
              if (idx !== -1) reminderMutesRows.splice(idx, 1);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: clientOptionsRows, error: null }),
            }),
          }),
        };
      }
      if (table === "client_stubs") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: stubOptionsRows, error: null }),
          }),
        };
      }
      if (table === "plan_limits") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
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
    reminderMutesRows,
    sessionPackagesRows,
    clientOptionsRows,
    stubOptionsRows,
  };
});
vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

// ─── Helpers ────────────────────────────────────────────────────────────────

async function openPracticeTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Practice" }));
  // wait for the initial practice_settings fetch to populate the form
  await waitFor(() => expect(getFieldInput("Business name")).toHaveValue(initialRow.business_name));
}

// The reminders mute picker's clientOptions/stubOptions/reminderMutes loads
// are separate effects from practice_settings — flush them too before a test
// interacts with the mute picker, or a late-resolving load can race the
// optimistic update from a mute/unmute click and double up (or clobber) state.
async function openPracticeTabAndFlushReminders() {
  await openPracticeTab();
  await screen.findByText("Grace Hopper (offline)");
}

async function openEmailsTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Emails" }));
  await screen.findByText("Manage emails");
}

async function openInterfaceTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: /^interface/i }));
  await screen.findByText("Hide search bar");
}

// Billing settings (session types & prices, bank details, card payments,
// subscription, referrals) have their own tab. Mirrors openPracticeTab's
// wait — the Bank details card is on this tab now.
async function openBillingTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: "Billing" }));
  await waitFor(() => expect(getFieldInput("Bank name")).toHaveValue(initialRow.bank_name));
}

async function openProfileTab() {
  render(<SettingsPage />);
  await screen.findByRole("button", { name: "Update profile" });
}

// Scheduling settings (calendar sync, auto-cancel, reschedule cutoff, session
// buffer, session-prep reminders, block-booking cancellation) live under their
// own "Schedule" tab. Wait on a toggle the practice_settings fetch populates —
// reschedule_cutoff_hours is 48 (not null) in initialRow, so "Enforce a cutoff"
// loads checked.
async function openScheduleTab() {
  render(<SettingsPage />);
  fireEvent.click(screen.getByRole("button", { name: /^schedule & bookings/i }));
  await waitFor(() => expect(screen.getByRole("checkbox", { name: /enforce a cutoff/i })).toBeChecked());
}

// As above, plus a flush of the mute picker's clientOptions/stubOptions/
// reminderMutes effects (see openPracticeTabAndFlushReminders).
async function openScheduleTabAndFlushReminders() {
  await openScheduleTab();
  await screen.findByText("Grace Hopper (offline)");
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
// to the card under its heading so we click the right one. SettingsCard
// renders the heading inside the collapse-toggle <button>, itself a direct
// child of the card wrapper alongside the content section — so the card
// boundary is the heading's toggle button's parent, not a <section> ancestor.
function getCardByHeading(headingText: string): HTMLElement {
  const card = screen.getByRole("heading", { name: headingText }).closest("button")?.parentElement;
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
    await openBillingTab();

    fireEvent.change(getFieldInput("Account number"), { target: { value: "87654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bank details" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ bank_account_number: "87654321" }));
    });
  });
});

describe("SettingsPage — session automation (auto-cancel unpaid sessions)", () => {
  it("turns auto-cancel on with a chosen deadline and saves it", async () => {
    await openScheduleTab();

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
    await openScheduleTab();

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

describe("SettingsPage — session-prep reminders", () => {
  it("turns reminders off, changes nothing else, and saves", async () => {
    await openScheduleTab();

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /remind me before sessions/i })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: /remind me before sessions/i }));
    fireEvent.click(within(getCardByHeading("Session-prep reminders")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ admin_reminders_enabled: false, admin_reminder_lead_minutes: 1440 }),
      );
    });
  });

  it("changes the lead time and saves it", async () => {
    await openScheduleTab();

    await screen.findByLabelText("Remind me");
    fireEvent.change(screen.getByLabelText("Remind me"), { target: { value: "60" } });
    fireEvent.click(within(getCardByHeading("Session-prep reminders")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ admin_reminders_enabled: true, admin_reminder_lead_minutes: 60 }),
      );
    });
  });

  it("mutes a client picked from the dropdown", async () => {
    await openScheduleTabAndFlushReminders();

    const select = await screen.findByDisplayValue("— mute a client —");
    fireEvent.change(select, { target: { value: "client:client-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));

    await waitFor(() => {
      expect(reminderMutesRows).toEqual([expect.objectContaining({ client_id: "client-1", stub_id: null })]);
    });
    expect(await screen.findByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });

  it("the Mute button stays disabled until a candidate is selected", async () => {
    await openScheduleTab();
    await screen.findByDisplayValue("— mute a client —");
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
  });

  it("unmutes an already-muted client", async () => {
    reminderMutesRows.push({ id: "mute-1", client_id: "client-1", stub_id: null });
    await openScheduleTab();

    const unmuteButton = await screen.findByRole("button", { name: "Unmute" });
    fireEvent.click(unmuteButton);

    await waitFor(() => expect(reminderMutesRows).toEqual([]));
    // Unmuted — the "Unmute" row is gone, and the client is selectable again in the dropdown.
    expect(screen.queryByRole("button", { name: "Unmute" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Ada Lovelace" })).toBeInTheDocument();
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

  it("shows the plain heading / agreement text / PDF fields (no form picker)", async () => {
    await openPracticeTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /require consent before app access/i }));

    expect(screen.queryByLabelText(/use one of your forms instead/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^heading$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/agreement text/i)).toBeInTheDocument();
  });

  it("does not send consent_questionnaire_id on save", async () => {
    await openPracticeTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /require consent before app access/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save consent settings" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty("consent_questionnaire_id");
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
    await openBillingTab();
    expect(screen.getByRole("button", { name: "Connect Stripe account" })).toBeInTheDocument();
  });

  it("shows a connected message once Stripe is linked", async () => {
    currentRow.stripe_connect_onboarded = true;
    await openBillingTab();
    expect(screen.getByText("Stripe connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Stripe account" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — Google Calendar sync", () => {
  it("shows a connect button when no calendar is linked", async () => {
    await openScheduleTab();
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument();
  });

  it("pauses sync for an already-connected calendar", async () => {
    setGoogleStatusRow({ connected: true, google_email: "admin@example.com", sync_enabled: true });
    await openScheduleTab();

    const syncToggle = await screen.findByRole("checkbox", { name: /sync to google calendar/i });
    fireEvent.click(syncToggle);

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith("set_google_calendar_sync_enabled", { p_enabled: false });
    });
  });

  it("disconnects Google Calendar after confirming", async () => {
    setGoogleStatusRow({ connected: true, google_email: "admin@example.com", sync_enabled: true });
    await openScheduleTab();

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
    await openProfileTab();

    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("create-billing-portal-session");
    });
  });

  // Regression coverage (2026-08-25): the demo account's billing_customer_id
  // is a real Stripe customer — clicking this in demo mode used to open a
  // real Stripe portal session for anyone browsing the public demo.
  it("never calls Stripe when the account is a demo account", async () => {
    currentRow.billing_customer_id = "cus_123";
    mockUseAuth.mockImplementation(() => ({ ...defaultAuthValue, isDemo: true }));
    await openProfileTab();

    fireEvent.click(await screen.findByRole("button", { name: "Manage subscription" }));

    expect(invokeSpy).not.toHaveBeenCalledWith("create-billing-portal-session");
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i));
  });

  it("does not render subscription settings on the Billing tab", async () => {
    await openBillingTab();

    expect(screen.queryByRole("heading", { name: "Subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage subscription" })).not.toBeInTheDocument();
  });
});

describe("SettingsPage — pause / resume practice", () => {
  async function openPauseConfirm(cardButtonName: RegExp) {
    await openBillingTab();
    fireEvent.click(await screen.findByRole("button", { name: cardButtonName }));
    return within(await screen.findByRole("dialog"));
  }

  it("pauses the practice: confirm dialog → pause-practice({paused:true}) → success toast (happy path)", async () => {
    const dialog = await openPauseConfirm(/^Pause practice$/);
    fireEvent.click(dialog.getByRole("button", { name: /^Pause practice$/ }));

    await waitFor(() => expect(invokeSpy).toHaveBeenCalledWith("pause-practice", { body: { paused: true } }));
    expect(defaultAuthValue.refreshPracticeSettings).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/paused/i));
  });

  it("resumes when already paused: card reads Resume and calls pause-practice({paused:false}) (happy path)", async () => {
    currentRow.is_paused = true;
    const dialog = await openPauseConfirm(/^Resume practice$/);
    fireEvent.click(dialog.getByRole("button", { name: /^Resume practice$/ }));

    await waitFor(() => expect(invokeSpy).toHaveBeenCalledWith("pause-practice", { body: { paused: false } }));
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/active again/i));
  });

  it("does nothing in demo mode (sad path)", async () => {
    mockUseAuth.mockImplementation(() => ({ ...defaultAuthValue, isDemo: true }));
    const dialog = await openPauseConfirm(/^Pause practice$/);
    fireEvent.click(dialog.getByRole("button", { name: /^Pause practice$/ }));

    expect(invokeSpy).not.toHaveBeenCalledWith("pause-practice", expect.anything());
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i));
  });

  it("warns when the DB flipped but Stripe didn't (sad path)", async () => {
    const original = invokeSpy.getMockImplementation();
    invokeSpy.mockImplementation((fn: string) =>
      fn === "pause-practice"
        ? Promise.resolve({ data: { stripeErrors: ["card declined"] }, error: null })
        : Promise.resolve({ data: { url: fn }, error: null }),
    );
    try {
      const dialog = await openPauseConfirm(/^Pause practice$/);
      fireEvent.click(dialog.getByRole("button", { name: /^Pause practice$/ }));
      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/couldn't pause stripe/i), "error"),
      );
    } finally {
      invokeSpy.mockImplementation(original!);
    }
  });
});

describe("SettingsPage — session types & prices", () => {
  it("adds a session type and lists it with price and duration (happy path)", async () => {
    await openBillingTab();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standard session" } });
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("Duration (min)"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add session type" }));

    expect(await screen.findByText(/Standard session/)).toBeInTheDocument();
    expect(screen.getByText(/£65\.00.*50 min/)).toBeInTheDocument();
  });

  it("adds a recurring block type and lists the per-session breakdown (happy path)", async () => {
    await openBillingTab();

    fireEvent.click(screen.getByLabelText(/Recurring block/i));
    // Price label switches to make clear it's the whole-block price.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Weekly block" } });
    fireEvent.change(screen.getByLabelText("Block price (£)"), { target: { value: "240" } });
    fireEvent.change(screen.getByLabelText("Number of weeks"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add session type" }));

    expect(await screen.findByText(/Weekly block/)).toBeInTheDocument();
    // £240.00 · 4-week block · £60.00/session · 50 min
    expect(screen.getByText(/£240\.00 · 4-week block · £60\.00\/session/)).toBeInTheDocument();

    // The row that was persisted carries the recurring config.
    expect(sessionPackagesRows[0]).toMatchObject({ is_recurring: true, session_count: 4, price_pence: 24000 });
  });

  it("does not add a session type in demo mode (sad path)", async () => {
    mockUseAuth.mockImplementation(() => ({ ...defaultAuthValue, isDemo: true }));
    await openBillingTab();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standard session" } });
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "65" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add session type" }));

    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i));
    expect(screen.queryByText(/Standard session/)).not.toBeInTheDocument();
  });

  it("removes a session type (happy path)", async () => {
    sessionPackagesRows.push({ id: "pkg-existing", name: "Extended session", price_pence: 9000, duration_minutes: 80 });
    await openBillingTab();

    expect(await screen.findByText(/Extended session/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByText(/Extended session/)).not.toBeInTheDocument());
  });
});

describe("SettingsPage — refer a friend", () => {
  it("shows the referral link and copies it to the clipboard (happy path)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockUseAuth.mockImplementation(() => ({
      ...defaultAuthValue,
      practiceSettings: { ...defaultAuthValue.practiceSettings, referral_code: "ABC12345" },
    }));
    await openBillingTab();

    expect(await screen.findByText(/register\?ref=ABC12345/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy referral link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ABC12345")));
    // the icon swaps to a tick on success
    expect(await screen.findByText("✓")).toBeInTheDocument();
  });

  it("does not show the card when the admin has no referral code yet (sad path)", async () => {
    await openBillingTab();
    expect(screen.queryByText("Refer a friend")).not.toBeInTheDocument();
  });
});

// Regression coverage (2026-08-25): practice_settings itself isn't covered by
// the DB's block_demo_write trigger — it has to stay writable for real admins
// saving their own settings — so nothing stopped a demo visitor from actually
// persisting changes here (and, for Manage subscription/Stripe Connect/Google
// Calendar, from triggering a real external side effect) unless every save
// handler checked isDemo itself. One representative case per external system
// this page touches — the rest all go through the same guardDemo() helper.
describe("SettingsPage — demo mode blocks every save action", () => {
  beforeEach(() => {
    mockUseAuth.mockImplementation(() => ({ ...defaultAuthValue, isDemo: true }));
  });

  it("does not save bank details", async () => {
    await openBillingTab();
    fireEvent.change(getFieldInput("Account number"), { target: { value: "87654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bank details" }));
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/demo mode/i));
  });

  it("does not save business information", async () => {
    await openPracticeTab();
    fireEvent.change(getFieldInput("Business name"), { target: { value: "New Name" } });
    fireEvent.click(
      within(getCardByHeading("Business information")).getByRole("button", { name: "Save business info" }),
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("does not disconnect Stripe Connect", async () => {
    currentRow.stripe_connect_onboarded = true;
    await openBillingTab();
    fireEvent.click(await screen.findByRole("button", { name: /disconnect/i }));
    expect(invokeSpy).not.toHaveBeenCalledWith("disconnect-stripe");
  });
});

describe("SettingsPage — interface preferences", () => {
  it("saves the client codenames setting", async () => {
    await openPracticeTab();

    fireEvent.click(screen.getByRole("checkbox", { name: /use codenames/i }));
    fireEvent.click(within(getCardByHeading("Client codenames")).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ use_client_codenames: true }));
    });
    // and re-pulls practice settings into the store so names on already-open
    // views flip immediately (admin_todos fad008cc / 28986dbf).
    expect(defaultAuthValue.refreshPracticeSettings).toHaveBeenCalled();
  });

  it("moves the sidebar expand button and persists the choice", async () => {
    await openInterfaceTab();

    fireEvent.click(screen.getByRole("button", { name: "Bottom" }));

    expect(localStorage.getItem("adminSidebarBtnPos")).toBe("bottom");
  });
});
