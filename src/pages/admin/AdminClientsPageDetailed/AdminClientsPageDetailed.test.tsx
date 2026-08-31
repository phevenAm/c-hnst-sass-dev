/**
 * AdminClientsPageDetailed — comprehensive test suite
 *
 * Strategy overview:
 *
 * 1. Supabase is mocked at the module level. Per-test data is set via
 *    supabaseMock.from.mockImplementation() in beforeEach or individual tests.
 *
 * 2. Redux thunks (fetchAllUsers, fetchAllResponses, fetchQuestionnaires,
 *    fetchSessionsByClientId) are replaced with no-ops so that useEffect
 *    dispatches don't overwrite the preloaded store state. Selectors and
 *    reducers are kept intact via importOriginal.
 *
 * 3. Heavy sub-components (SessionCard, ProgressChart, modals) are stubbed
 *    to prevent their own side-effects and keep assertions focused on this
 *    component's logic.
 *
 * 4. renderPage() mounts the component inside a MemoryRouter with a matching
 *    Route so that useParams() correctly returns clientId from the URL.
 */

import React from "react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import auditLogsReducer from "@store/slices/auditLogsSlice";
import practiceSettingsReducer from "@store/slices/practiceSettingsSlice";
import assignmentsReducer from "@store/slices/questionnaireAssignmentsSlice";
import questionnairesReducer from "@store/slices/questionnairesSlice";
import resourcesReducer from "@store/slices/resourcesSlice";
import responsesReducer from "@store/slices/responsesSlice";
import sessionsReducer from "@store/slices/sessionsSlice";
import tagsReducer from "@store/slices/tagsSlice";
import themeReducer from "@store/slices/themeSlice";
import userDirectoryReducer from "@store/slices/userDirectorySlice";

import AdminClientsPageDetailed from "./AdminClientsPageDetailed";

vi.mock("@/context/EncryptionContext", () => ({
  useEncryption: () => ({ status: "unlocked", decryptNote: vi.fn(async (ciphertext: string) => ciphertext) }),
}));

// ── Supabase mock ─────────────────────────────────────────────────────────────
//
// makeChain() returns an object that looks like a Supabase query builder.
// It supports both `await chain` (via .then) and `.then()` directly because
// the component uses both patterns — useEffect uses .then() directly while
// handlers use await.
//
// mockReturnThis() on select/eq/etc. returns the chain itself, so chained
// calls like .select("*").eq("id", x).order("created_at") all stay on the
// same chain and resolve to { data, error } when awaited.
//
// vi.hoisted() is required here because vi.mock() factories are hoisted to
// the top of the file by Vitest. Any variable referenced inside a factory
// must be initialized before the factory runs — regular const/let declarations
// are in the TDZ at that point. vi.hoisted() runs its callback before the
// mock factories, making the returned values available in time.

const { makeChain, supabaseMock, mockShowToast } = vi.hoisted(() => {
  const makeChain = (data: unknown[] | null = null, error: unknown = null) => {
    const result = Promise.resolve({ data, error });
    const chain: Record<string, unknown> & {
      then: (...args: unknown[]) => unknown;
    } = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(() => result),
      maybeSingle: vi.fn(() => result),
      // then + catch make this a "thenable", so Promise.all and await both work
      then: (res: (...args: unknown[]) => unknown, rej?: (...args: unknown[]) => unknown) =>
        result.then(res as never, rej as never),
      catch: (rej: (...args: unknown[]) => unknown) => result.catch(rej as never),
    };
    return chain;
  };
  const channelStub = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  return {
    makeChain,
    supabaseMock: {
      from: vi.fn(() => makeChain()),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
    mockShowToast: vi.fn(),
  };
});

vi.mock("@/lib/supabase.js", () => ({ supabase: supabaseMock }));

// ── Thunk no-ops ──────────────────────────────────────────────────────────────
//
// The component dispatches thunks unconditionally in useEffect. Those thunks
// call supabase and would overwrite the preloaded store state with empty data.
// Replacing them with no-ops keeps the preloaded state intact throughout tests.
// importOriginal spreads everything else (reducer, selectors) so they work as normal.

vi.mock("@store/slices/userDirectorySlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/userDirectorySlice")>();
  return { ...mod, fetchAllUsers: () => () => Promise.resolve() };
});

vi.mock("@store/slices/responsesSlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/responsesSlice")>();
  return { ...mod, fetchAllResponses: () => () => Promise.resolve() };
});

vi.mock("@store/slices/questionnairesSlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/questionnairesSlice")>();
  return { ...mod, fetchQuestionnaires: () => () => Promise.resolve() };
});

vi.mock("@store/slices/sessionsSlice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/slices/sessionsSlice")>();
  return { ...mod, fetchSessionsByClientId: () => () => Promise.resolve() };
});

// useFetchOnIdle watches state.sessions.status and dispatches a thunk when "idle".
// Making it a no-op is simpler than setting status to "succeeded" in every test.
vi.mock("@store/hooks", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@store/hooks")>();
  return { ...mod, useFetchOnIdle: vi.fn() };
});

// ── Context mocks ─────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true, isDemo: false }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// ── Shared component stubs ────────────────────────────────────────────────────
//
// Stubbing these prevents their own supabase calls and Recharts rendering.
// SessionCard in particular fetches session_events on mount — without stubbing
// it would make additional supabase calls that muddy assertions.

vi.mock("@components/shared/index", () => ({
  Avatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
  // Render a plain <button> so aria queries like getByRole("button", { name }) work.
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  ProgressChart: () => <div data-testid="progress-chart" />,
  HideableSection: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // Render a plain <input> and forward the string value to handleChange,
  // matching the real Search API (it calls handleChange(string), not an event).
  Search: ({
    handleChange,
    placeholder,
    id,
  }: {
    handleChange: (v: string) => void;
    placeholder?: string;
    id?: string;
  }) => <input id={id} placeholder={placeholder} onChange={(e) => handleChange(e.target.value)} />,
  // Render the primary action plus every option as flat, always-visible
  // buttons (the real component hides options behind a dropdown toggle;
  // that interaction is SplitButton's own concern, not this page's).
  SplitButton: ({
    primaryLabel,
    primaryAction,
    options,
  }: {
    primaryLabel: string;
    primaryAction: () => void;
    options: { label: string; onClick: () => void; disabled?: boolean }[];
  }) => (
    <div>
      <button type="button" onClick={primaryAction}>
        {primaryLabel}
      </button>
      {options.map(({ label, onClick, disabled }) => (
        <button type="button" key={label} onClick={onClick} disabled={disabled}>
          {label}
        </button>
      ))}
    </div>
  ),
  // Render two plain buttons so click events trigger the tab switch callbacks.
  ToggleButtonTabs: ({
    leftButtonTitle,
    leftButtonAction,
    rightButtonTitle,
    rightButtonAction,
  }: {
    leftButtonTitle: string;
    leftButtonAction: () => void;
    rightButtonTitle: string;
    rightButtonAction: () => void;
  }) => (
    <div>
      <button type="button" onClick={leftButtonAction}>
        {leftButtonTitle}
      </button>
      <button type="button" onClick={rightButtonAction}>
        {rightButtonTitle}
      </button>
    </div>
  ),
}));

vi.mock("@components/shared/SessionCard/SessionCard", () => ({
  SessionCard: ({ session }: { session: { id: string } }) => <div data-testid={`session-card-${session.id}`} />,
}));

vi.mock("@components/shared/SessionCard/CreateSessionModal/CreateSessionModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="create-session-modal">
      <button type="button" onClick={onClose}>
        Close create
      </button>
    </div>
  ),
}));

vi.mock("../AdminClientsPage/modals/SessionNotesModal/SessionNotesModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="notes-modal">
      <button type="button" onClick={onClose}>
        Close notes
      </button>
    </div>
  ),
}));

vi.mock("../AdminClientsPage/modals/DeleteClientModal/DeleteClientModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="delete-modal">
      <button type="button" onClick={onClose}>
        Close delete
      </button>
    </div>
  ),
}));

vi.mock("../utils/AdminClientsPageUtils", () => ({
  exportClientPDF: vi.fn(),
  getScoreAverage: vi.fn(() => null),
}));

// ── Test data ─────────────────────────────────────────────────────────────────

const CLIENT_ID = "client-test-abc-123";

const mockClient = {
  id: CLIENT_ID,
  first_name: "Jane",
  last_name: "Smith",
  email: "jane@example.com",
  role: "client",
  created_at: "2025-03-15T00:00:00Z",
  display_name: "Jane S",
  avatar_url: null,
  disabled: false,
};

const futureISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const pastISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const requestedISO = new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString();

const mockUpcomingSession = {
  id: "session-upcoming-1",
  client_id: CLIENT_ID,
  scheduled_at: futureISO,
  duration_minutes: 60,
  status: "scheduled",
  paid: false,
  attended: null,
  notes: null,
  location: null,
  address: null,
  created_at: new Date().toISOString(),
};

const mockPastSession = {
  id: "session-past-1",
  client_id: CLIENT_ID,
  scheduled_at: pastISO,
  duration_minutes: 50,
  status: "completed",
  paid: true,
  attended: true,
  notes: "Great progress!",
  location: null,
  address: null,
  created_at: new Date().toISOString(),
};

const mockPendingRequest = {
  id: "req-pending-1",
  session_id: mockUpcomingSession.id,
  client_id: CLIENT_ID,
  requested_at: requestedISO,
  message: "I have a conflict that day",
  status: "pending",
  created_at: new Date().toISOString(),
};

// ── Store factory ─────────────────────────────────────────────────────────────
//
// Creates a real Redux store with controlled preloaded state.
// The inspirationalQuotesApi RTK Query slice is intentionally omitted —
// the component doesn't use it, so no selector will try to read that state key.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTestStore(extra: Record<string, any> = {}) {
  return configureStore({
    reducer: {
      userDirectory: userDirectoryReducer,
      sessions: sessionsReducer,
      questionnaires: questionnairesReducer,
      responses: responsesReducer,
      assignments: assignmentsReducer,
      resources: resourcesReducer,
      tags: tagsReducer,
      theme: themeReducer,
      auditLogs: auditLogsReducer,
      practiceSettings: practiceSettingsReducer,
    },
    preloadedState: {
      userDirectory: { users: [mockClient], status: "succeeded", error: null },
      sessions: { sessions: [mockUpcomingSession, mockPastSession], status: "succeeded", error: null },
      questionnaires: { questionnaires: [], status: "succeeded", error: null },
      responses: { responses: [], status: "succeeded", error: null },
      practiceSettings: { data: null, status: "succeeded", error: null },
      ...extra,
    },
  });
}

// ── Render helper ─────────────────────────────────────────────────────────────
//
// Wraps the component in a real store + MemoryRouter so useParams() extracts
// clientId from the URL — the same way the real app router works.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPage(extra: Record<string, any> = {}, search = "") {
  const testStore = createTestStore(extra);
  return render(
    <Provider store={testStore}>
      <MemoryRouter initialEntries={[`/admin/clients/${CLIENT_ID}${search}`]}>
        <Routes>
          <Route path="/admin/clients/:clientId" element={<AdminClientsPageDetailed />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

// A block booking: several weekly sessions sharing one metadata.block_id.
function makeBlockSessions(count: number, blockId = "blk-1") {
  const start = Date.now() + 3 * 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => ({
    ...mockUpcomingSession,
    id: `block-session-${i + 1}`,
    scheduled_at: new Date(start + i * 7 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      block_id: blockId,
      block_pos: i + 1,
      block_total: count,
      block_start: new Date(start).toISOString(),
      block_price_pence: count * 8000,
    },
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AdminClientsPageDetailed", () => {
  // RTL does not auto-register cleanup in Vitest unless globals:true is set.
  // afterEach(cleanup) ensures the DOM is wiped between tests so renders
  // don't accumulate and cause "found multiple elements" failures.
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all supabase queries return an empty array with no error.
    // Individual tests override this with mockImplementation when they need
    // specific data (e.g. pending reschedule requests).
    supabaseMock.from.mockImplementation(() => makeChain([]));
  });

  // ── Client not found ─────────────────────────────────────────────────────────

  describe("when no user in the store matches the URL clientId", () => {
    const emptyUsers = { userDirectory: { users: [], status: "succeeded", error: null } };

    it("shows the 'Client not found' heading", () => {
      renderPage(emptyUsers);
      expect(screen.getByText("Client not found")).toBeInTheDocument();
    });

    it("shows a back button that navigates to /admin/clients", () => {
      renderPage(emptyUsers);
      expect(screen.getByRole("button", { name: /back to clients/i })).toBeInTheDocument();
    });

    it("does not render the profile hero", () => {
      renderPage(emptyUsers);
      expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
    });
  });

  // ── Profile hero ─────────────────────────────────────────────────────────────

  describe("profile hero (client found)", () => {
    it("renders the client's display name", () => {
      renderPage();
      // clientDisplayName() prefers display_name over first/last, and the
      // fixture sets one ("Jane S") — target the h1 specifically since the
      // Avatar stub also renders it, so getByText would find two elements.
      expect(screen.getByRole("heading", { level: 1, name: /jane s/i })).toBeInTheDocument();
    });

    it("renders the client's email address", () => {
      renderPage();
      expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    });

    it("renders the 'Client since' date formatted from created_at", () => {
      renderPage();
      // mockClient.created_at = "2025-03-15T00:00:00Z" → "Client since 15/03/2025"
      expect(screen.getByText(/client since/i)).toBeInTheDocument();
      expect(screen.getByText(/15\/03\/2025/i)).toBeInTheDocument();
    });

    it("shows no status badge for a normal active client", () => {
      renderPage();
      expect(screen.queryByText("Paused")).not.toBeInTheDocument();
      expect(screen.queryByText("Deactivated")).not.toBeInTheDocument();
    });

    it("shows a Paused badge when the client is disabled", () => {
      renderPage({
        userDirectory: {
          users: [{ ...mockClient, disabled: true }],
          status: "succeeded",
          error: null,
        },
      });
      expect(screen.getByText("Paused")).toBeInTheDocument();
    });

    it("shows a Deactivated badge when the client is archived", () => {
      renderPage({
        userDirectory: {
          users: [{ ...mockClient, archived_at: "2026-08-01T00:00:00Z" }],
          status: "succeeded",
          error: null,
        },
      });
      expect(screen.getByText("Deactivated")).toBeInTheDocument();
    });

    it("shows 'Deactivated · anonymised' when the client is archived and anonymised, and prefers it over Paused", () => {
      renderPage({
        userDirectory: {
          users: [
            {
              ...mockClient,
              disabled: true,
              archived_at: "2026-08-01T00:00:00Z",
              anonymised_at: "2026-08-01T00:00:00Z",
            },
          ],
          status: "succeeded",
          error: null,
        },
      });
      expect(screen.getByText("Deactivated · anonymised")).toBeInTheDocument();
      expect(screen.queryByText("Paused")).not.toBeInTheDocument();
    });
  });

  // ── Stats bar ─────────────────────────────────────────────────────────────────

  describe("stats bar", () => {
    it("shows 0 check-ins when there are no responses in the store", () => {
      renderPage();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("shows — for last check-in when there are no responses", () => {
      renderPage();
      // Both "Latest score" and "Last check-in" show "—" when there are no
      // responses (getScoreAverage returns null and lastCheckIn defaults to "—").
      // getAllByText asserts that at least two instances exist, which is correct.
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    });

    it("shows the correct check-in count when responses exist", () => {
      const mockResponse = {
        id: "resp-1",
        user_id: CLIENT_ID,
        questionnaire_id: "q-1",
        answers: {},
        score: 7,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      renderPage({
        responses: { responses: [mockResponse], status: "succeeded", error: null },
        questionnaires: {
          questionnaires: [{ id: "q-1", title: "Wellbeing check", published: true, tag_id: null, created_at: "" }],
          status: "succeeded",
          error: null,
        },
      });
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  // ── Sessions section ──────────────────────────────────────────────────────────

  describe("sessions section", () => {
    it("renders the Sessions heading", () => {
      renderPage();
      expect(screen.getByText("Sessions")).toBeInTheDocument();
    });

    it("shows the + New session button", () => {
      renderPage();
      expect(screen.getByRole("button", { name: /\+ new session/i })).toBeInTheDocument();
    });

    // Default tab is "upcoming" — future sessions appear, past ones do not
    it("displays the upcoming session card on initial render", () => {
      renderPage();
      expect(screen.getByTestId(`session-card-${mockUpcomingSession.id}`)).toBeInTheDocument();
    });

    it("does not show the past session card on the upcoming tab", () => {
      renderPage();
      expect(screen.queryByTestId(`session-card-${mockPastSession.id}`)).not.toBeInTheDocument();
    });

    it("switches to past sessions when the Past tab is clicked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^past$/i }));
      await waitFor(() => {
        expect(screen.getByTestId(`session-card-${mockPastSession.id}`)).toBeInTheDocument();
        expect(screen.queryByTestId(`session-card-${mockUpcomingSession.id}`)).not.toBeInTheDocument();
      });
    });

    it("switches back to upcoming when the Upcoming tab is clicked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^past$/i }));
      await waitFor(() => screen.getByTestId(`session-card-${mockPastSession.id}`));
      fireEvent.click(screen.getByRole("button", { name: /^upcoming$/i }));
      await waitFor(() => {
        expect(screen.getByTestId(`session-card-${mockUpcomingSession.id}`)).toBeInTheDocument();
      });
    });

    it("shows 'No sessions found!' when the store has no sessions at all", () => {
      renderPage({ sessions: { sessions: [], status: "succeeded", error: null } });
      expect(screen.getByText("No sessions found!")).toBeInTheDocument();
    });

    it("shows 'No sessions found!' when a search term matches nothing", async () => {
      renderPage();
      fireEvent.change(screen.getByPlaceholderText("Find a session..."), {
        target: { value: "xyznotamatch999" },
      });
      await waitFor(() => {
        expect(screen.getByText("No sessions found!")).toBeInTheDocument();
        expect(screen.queryByTestId(`session-card-${mockUpcomingSession.id}`)).not.toBeInTheDocument();
      });
    });

    it("filters sessions by date string when a search term is entered", async () => {
      renderPage();
      // The upcoming session's year will appear in the formatted date string
      const yearStr = new Date(futureISO).getFullYear().toString();
      fireEvent.change(screen.getByPlaceholderText("Find a session..."), {
        target: { value: yearStr },
      });
      await waitFor(() => {
        expect(screen.getByTestId(`session-card-${mockUpcomingSession.id}`)).toBeInTheDocument();
      });
    });

    it("restores all sessions when the search is cleared", async () => {
      renderPage();
      const input = screen.getByPlaceholderText("Find a session...");
      fireEvent.change(input, { target: { value: "xyznotamatch999" } });
      await waitFor(() => expect(screen.getByText("No sessions found!")).toBeInTheDocument());
      fireEvent.change(input, { target: { value: "" } });
      await waitFor(() => expect(screen.getByTestId(`session-card-${mockUpcomingSession.id}`)).toBeInTheDocument());
    });
  });

  // ── Pending reschedule requests ───────────────────────────────────────────────

  describe("pending reschedule requests banner", () => {
    // Scope the mock to the reschedule_requests table — a blanket
    // mockImplementation would also feed this fixture to
    // questionnaire_assignments, which AdminClientsPageDetailed reads into
    // assignedForms and crashes on (it expects { questionnaires, ... } shape).
    function mockRescheduleRequests(requests: unknown[]) {
      supabaseMock.from.mockImplementation((table: string) =>
        table === "reschedule_requests" ? makeChain(requests) : makeChain(null),
      );
    }

    it("is not rendered when supabase returns no requests", () => {
      renderPage();
      expect(screen.queryByText("Pending reschedule requests")).not.toBeInTheDocument();
    });

    it("appears when supabase returns a pending request", async () => {
      mockRescheduleRequests([mockPendingRequest]);
      renderPage();
      await waitFor(() => {
        // Singular for exactly one request — "Pending reschedule request{s}" pluralizes on count.
        expect(screen.getByText(/pending reschedule request/i)).toBeInTheDocument();
      });
    });

    it("shows the client's message in quotes", async () => {
      mockRescheduleRequests([mockPendingRequest]);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(`"${mockPendingRequest.message}"`)).toBeInTheDocument();
      });
    });

    it("shows Accept and Decline buttons for each pending request", async () => {
      mockRescheduleRequests([mockPendingRequest]);
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^decline$/i })).toBeInTheDocument();
      });
    });

    it("does not render the banner when requests are accepted or rejected", async () => {
      mockRescheduleRequests([{ ...mockPendingRequest, status: "accepted" }]);
      renderPage();
      // Give async state update a chance to resolve
      await waitFor(() => {
        expect(screen.queryByText("Pending reschedule requests")).not.toBeInTheDocument();
      });
    });

    describe("Accept button", () => {
      beforeEach(() => {
        mockRescheduleRequests([mockPendingRequest]);
      });

      it("calls supabase to update the linked session's scheduled_at", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^accept$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
        await waitFor(() => {
          expect(supabaseMock.from).toHaveBeenCalledWith("sessions");
        });
      });

      it("inserts an in-app notification for the client", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^accept$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
        await waitFor(() => {
          expect(supabaseMock.from).toHaveBeenCalledWith("notifications");
        });
      });

      it("shows 'Reschedule accepted — session updated' toast", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^accept$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
        await waitFor(() => {
          expect(mockShowToast).toHaveBeenCalledWith("Reschedule accepted — session updated");
        });
      });

      it("hides the pending banner after the request is accepted", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^accept$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
        await waitFor(() => {
          expect(screen.queryByText("Pending reschedule requests")).not.toBeInTheDocument();
        });
      });

      it("shows an error toast if the session update fails", async () => {
        supabaseMock.from.mockImplementation((table: string) => {
          if (table === "reschedule_requests") return makeChain([mockPendingRequest]);
          // Simulate a supabase error for the sessions table
          if (table === "sessions") return makeChain(null, { message: "DB error" });
          return makeChain([]);
        });
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^accept$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^accept$/i }));
        await waitFor(() => {
          expect(mockShowToast).toHaveBeenCalledWith("Failed to update session", "danger");
        });
      });
    });

    describe("Decline button", () => {
      beforeEach(() => {
        mockRescheduleRequests([mockPendingRequest]);
      });

      it("calls supabase to update the request status to rejected", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^decline$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
        await waitFor(() => {
          expect(supabaseMock.from).toHaveBeenCalledWith("reschedule_requests");
        });
      });

      it("inserts an in-app notification for the client", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^decline$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
        await waitFor(() => {
          expect(supabaseMock.from).toHaveBeenCalledWith("notifications");
        });
      });

      it("shows a 'Reschedule declined' toast", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^decline$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
        await waitFor(() => {
          expect(mockShowToast).toHaveBeenCalledWith("Reschedule declined");
        });
      });

      it("hides the pending banner after the request is declined", async () => {
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^decline$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
        await waitFor(() => {
          expect(screen.queryByText("Pending reschedule requests")).not.toBeInTheDocument();
        });
      });

      it("shows an error toast if the supabase update fails", async () => {
        supabaseMock.from.mockImplementation((table: string) => {
          if (table === "reschedule_requests") return makeChain([mockPendingRequest], { message: "DB error" });
          return makeChain([]);
        });
        renderPage();
        await waitFor(() => screen.getByRole("button", { name: /^decline$/i }));
        fireEvent.click(screen.getByRole("button", { name: /^decline$/i }));
        await waitFor(() => {
          expect(mockShowToast).toHaveBeenCalledWith("Failed to decline request", "danger");
        });
      });
    });
  });

  // ── Modals ─────────────────────────────────────────────────────────────────

  describe("Notes modal", () => {
    // Account Summary lives inside the Configure client modal, not as its
    // own dropdown item — open that first, then the Account Summary button
    // within it.
    async function openAccountSummary() {
      fireEvent.click(screen.getByRole("button", { name: /^configure client$/i }));
      fireEvent.click(await screen.findByRole("button", { name: /open account summary/i }));
    }

    it("opens when the Account Summary button (inside Configure client) is clicked", async () => {
      renderPage();
      await openAccountSummary();
      expect(await screen.findByTestId("notes-modal")).toBeInTheDocument();
    });

    it("closes when its onClose is triggered", async () => {
      renderPage();
      await openAccountSummary();
      await screen.findByTestId("notes-modal");
      fireEvent.click(screen.getByRole("button", { name: /close notes/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("notes-modal")).not.toBeInTheDocument();
      });
    });
  });

  describe("Create Session modal", () => {
    it("opens when + New session is clicked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /\+ new session/i }));
      expect(await screen.findByTestId("create-session-modal")).toBeInTheDocument();
    });

    it("closes when its onClose is triggered", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /\+ new session/i }));
      await screen.findByTestId("create-session-modal");
      fireEvent.click(screen.getByRole("button", { name: /close create/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("create-session-modal")).not.toBeInTheDocument();
      });
    });
  });

  describe("Delete Client modal", () => {
    it("opens when Delete client is clicked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /delete client/i }));
      expect(await screen.findByTestId("delete-modal")).toBeInTheDocument();
    });

    it("closes when its onClose is triggered", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /delete client/i }));
      await screen.findByTestId("delete-modal");
      fireEvent.click(screen.getByRole("button", { name: /close delete/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
      });
    });
  });

  // ── Deactivate / reactivate (client lifecycle) ──────────────────────────────

  describe("Deactivate / reactivate client", () => {
    const archived = {
      userDirectory: {
        users: [{ ...mockClient, archived_at: "2026-08-01T00:00:00Z", disabled: true }],
        status: "succeeded",
        error: null,
      },
    };

    it("offers a Deactivate action for an active client and opens the confirm dialog", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      expect(screen.getByText("Deactivate this client?")).toBeInTheDocument();
    });

    it("calls admin_archive_client without anonymise when confirmed with the box unchecked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      // The confirm button inside the dialog carries the same label — it's the last one.
      const deactivateButtons = screen.getAllByRole("button", { name: "Deactivate" });
      fireEvent.click(deactivateButtons[deactivateButtons.length - 1]);

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("admin_archive_client", {
          target_user_id: CLIENT_ID,
          p_reason: null,
          p_anonymise: false,
        }),
      );
    });

    it("passes p_anonymise: true when the anonymise box is ticked", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
      fireEvent.click(screen.getByRole("checkbox"));
      const deactivateButtons = screen.getAllByRole("button", { name: "Deactivate" });
      fireEvent.click(deactivateButtons[deactivateButtons.length - 1]);

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("admin_archive_client", {
          target_user_id: CLIENT_ID,
          p_reason: null,
          p_anonymise: true,
        }),
      );
    });

    it("shows a Reactivate action for an already-deactivated client and calls admin_unarchive_client", async () => {
      renderPage(archived);
      expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));

      await waitFor(() =>
        expect(supabaseMock.rpc).toHaveBeenCalledWith("admin_unarchive_client", { target_user_id: CLIENT_ID }),
      );
    });
  });

  // ── Export PDF button ─────────────────────────────────────────────────────────

  describe("Export PDF button", () => {
    // Export now covers client details/sessions/check-ins/etc, not just
    // check-in responses, so the trigger opens a section picker instead of
    // being gated on response count — only the picker's own confirm button
    // is conditionally disabled, based on which sections are ticked.
    it("opens the export picker when clicked, even with no responses", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^export pdf$/i }));
      expect(await screen.findByText("Export client PDF")).toBeInTheDocument();
    });

    it("picker's confirm button starts enabled since client details/sessions/check-ins are ticked by default", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^export pdf$/i }));
      await screen.findByText("Export client PDF");
      expect(screen.getAllByRole("button", { name: /^export pdf$/i }).at(-1)).not.toBeDisabled();
    });

    it("is enabled when the client has at least one response for a known questionnaire", () => {
      const mockResponse = {
        id: "resp-1",
        user_id: CLIENT_ID,
        questionnaire_id: "q-1",
        answers: {},
        score: 7,
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const mockQuestionnaire = {
        id: "q-1",
        title: "Wellbeing check",
        published: true,
        tag_id: null,
        created_at: "",
      };
      renderPage({
        responses: { responses: [mockResponse], status: "succeeded", error: null },
        questionnaires: { questionnaires: [mockQuestionnaire], status: "succeeded", error: null },
      });
      expect(screen.getByRole("button", { name: /export pdf/i })).not.toBeDisabled();
    });
  });

  // ── Session pagination ────────────────────────────────────────────────────────

  describe("session pagination", () => {
    // Pagination appears only when searchResults.length > 4 (maxPageSize)
    it("does not show pagination controls with 4 or fewer sessions", () => {
      renderPage();
      expect(screen.queryByRole("button", { name: /← prev/i })).not.toBeInTheDocument();
    });

    it("shows Prev and Next controls when there are more than 4 sessions", () => {
      const manySessions = Array.from({ length: 5 }, (_, i) => ({
        ...mockUpcomingSession,
        id: `session-upcoming-${i}`,
        scheduled_at: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      renderPage({ sessions: { sessions: manySessions, status: "succeeded", error: null } });
      expect(screen.getByRole("button", { name: /← prev/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next →/i })).toBeInTheDocument();
    });

    it("Prev button is disabled on page 1", () => {
      const manySessions = Array.from({ length: 5 }, (_, i) => ({
        ...mockUpcomingSession,
        id: `session-upcoming-${i}`,
        scheduled_at: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      renderPage({ sessions: { sessions: manySessions, status: "succeeded", error: null } });
      expect(screen.getByRole("button", { name: /← prev/i })).toBeDisabled();
    });

    it("Next button is disabled on the last page", async () => {
      const manySessions = Array.from({ length: 5 }, (_, i) => ({
        ...mockUpcomingSession,
        id: `session-upcoming-${i}`,
        scheduled_at: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      renderPage({ sessions: { sessions: manySessions, status: "succeeded", error: null } });
      // 5 sessions / maxPageSize 4 = 2 pages — clicking Next once reaches the last page
      fireEvent.click(screen.getByRole("button", { name: /next →/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /next →/i })).toBeDisabled();
      });
    });

    it("Prev becomes enabled after navigating to page 2", async () => {
      const manySessions = Array.from({ length: 5 }, (_, i) => ({
        ...mockUpcomingSession,
        id: `session-upcoming-${i}`,
        scheduled_at: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      renderPage({ sessions: { sessions: manySessions, status: "succeeded", error: null } });
      fireEvent.click(screen.getByRole("button", { name: /next →/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /← prev/i })).not.toBeDisabled();
      });
    });
  });

  // ── Deep link: ?session=<id> ("Manage this session →", Payments "View") ──────
  //
  // targetSessionPage (a useMemo) reads maxPageSize, which was declared with
  // `const` further down the component body — in the TDZ while the memo runs.
  // Harmless while highlightSessionId is null (the memo returns early), but the
  // moment ?session= is set the memo runs past that and threw
  // "Cannot access 'maxPageSize' before initialization", crashing the page.
  describe("?session= deep link", () => {
    it("renders without crashing when a session id is in the URL", () => {
      renderPage({}, `?session=${mockUpcomingSession.id}`);
      expect(screen.getByRole("heading", { level: 1, name: /jane s/i })).toBeInTheDocument();
    });

    it("still renders when the ?session= id points at a session inside a block", () => {
      const block = makeBlockSessions(3);
      renderPage({ sessions: { sessions: block, status: "succeeded", error: null } }, `?session=${block[1].id}`);
      expect(screen.getByRole("heading", { level: 1, name: /jane s/i })).toBeInTheDocument();
    });

    it("does not crash for an unknown ?session= id", () => {
      renderPage({}, "?session=does-not-exist");
      expect(screen.getByRole("heading", { level: 1, name: /jane s/i })).toBeInTheDocument();
    });
  });

  // ── Session prep card is scoped to this client ─────────────────────────────
  //
  // state.sessions.sessions is a shared list. After booking sessions for two
  // different clients (or visiting the scheduler), it holds more than Jane's
  // rows. `nextSession` used to be picked from the whole list with no client
  // filter, so it could resolve to a stranger's session — then "Manage this
  // session →" deep-links to a row that isn't in Jane's list and silently
  // no-ops. The stats ("N sessions · M attended") were inflated the same way.
  describe("session prep card scoping", () => {
    it("ignores other clients' sessions in the shared store", () => {
      const strangerSooner = {
        ...mockUpcomingSession,
        id: "stranger-session-1",
        client_id: "some-other-client",
        // sooner than Jane's upcoming session, so the unscoped code picked this
        scheduled_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      };
      renderPage({
        sessions: {
          sessions: [strangerSooner, mockUpcomingSession, mockPastSession],
          status: "succeeded",
          error: null,
        },
      });

      // Counts only Jane's two rows, not the stranger's (was "3 sessions").
      expect(screen.getByText(/2 sessions · 1 attended/)).toBeInTheDocument();
      // The button is still offered — nextSession resolved to Jane's own row.
      expect(screen.getByRole("button", { name: /manage this session/i })).toBeInTheDocument();
    });

    it("opens the next session in a modal on 'Manage this session' (not a silent scroll)", () => {
      renderPage();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /manage this session/i }));

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(/^Session —/);
      // The modal shows Jane's upcoming session's own card.
      expect(dialog.querySelector(`[data-testid="session-card-${mockUpcomingSession.id}"]`)).toBeInTheDocument();
    });
  });

  // ── Block bookings on the upcoming tab ──────────────────────────────────────
  //
  // Blocks must be grouped BEFORE pagination — grouping the already-sliced page
  // used to drop the grouping whenever a block straddled a page boundary (each
  // slice saw <2 of its sessions), and a 3-session block also ate 3 of the
  // page's 4 rows instead of one.
  describe("block bookings (upcoming tab)", () => {
    it("renders a 3-session block as one card with three tabs, not three separate cards", () => {
      const block = makeBlockSessions(3);
      renderPage({ sessions: { sessions: block, status: "succeeded", error: null } });

      expect(screen.getByText(/3 session block/i)).toBeInTheDocument();
      expect(screen.getAllByRole("tab")).toHaveLength(3);
      // The stubbed inner SessionCard renders once (for the active tab only).
      expect(screen.getAllByTestId(/^session-card-block-session-/)).toHaveLength(1);
    });

    it("shows a block AND every single session on one page — a block counts as one row", () => {
      const block = makeBlockSessions(3, "blk-A");
      const singles = Array.from({ length: 3 }, (_, i) => ({
        ...mockUpcomingSession,
        id: `single-${i + 1}`,
        // after the block so ordering is block, then singles
        scheduled_at: new Date(Date.now() + (40 + i) * 24 * 60 * 60 * 1000).toISOString(),
      }));
      renderPage({
        sessions: { sessions: [...block, ...singles], status: "succeeded", error: null },
      });

      // 1 block + 3 singles = 4 items = a single page → no pagination controls.
      expect(screen.queryByRole("button", { name: /next →/i })).not.toBeInTheDocument();
      expect(screen.getByText(/3 session block/i)).toBeInTheDocument();
      expect(screen.getByTestId("session-card-single-1")).toBeInTheDocument();
      expect(screen.getByTestId("session-card-single-2")).toBeInTheDocument();
      expect(screen.getByTestId("session-card-single-3")).toBeInTheDocument();
    });
  });
});
