import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { store } from "@/store";

import type { Session } from "@/models/globalTypes";
import { fetchAvailability } from "@/store/slices/availabilitySlice";
import { fetchSessionsByClientId } from "@/store/slices/sessionsSlice";
import ClientSchedule from "./ClientSchedule";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({
    userProfile: { id: "client-1", role: "client" },
    isDemo: false,
    isAdmin: false,
    // null = no cutoff configured, so SessionCard's action buttons always
    // show for a future session regardless of how soon it is.
    rescheduleCutoffHours: null,
  }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// SchedulerCalendar wraps react-big-calendar, which doesn't render anything
// clickable in jsdom in a way worth fighting with here — this test is about
// ClientSchedule's own onSelectEvent handling, not react-big-calendar's
// internals (schedulerUtils.test.ts already covers the event-mapping logic).
// The stub renders one button per event so a "click" is just firing onSelectEvent
// with that event, exactly like react-big-calendar would.
vi.mock("@/components/shared/SchedulerCalendar/SchedulerCalendar", () => ({
  default: ({ events, onSelectEvent }: any) => (
    <div data-testid="scheduler-calendar-stub">
      {events.map((event: any) => (
        <button key={event.id} type="button" onClick={() => onSelectEvent?.(event)}>
          {event.id}
        </button>
      ))}
    </div>
  ),
}));

const baseSession: Session = {
  id: "session-1",
  client_id: "client-1",
  created_by: "admin-1",
  scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
  duration_minutes: 50,
  status: "scheduled",
  attended: null,
  paid: true,
  price_pence: 6000,
  location: "remote",
  address: null,
  notes: null,
  reference_code: null,
  metadata: null,
  is_supervision: false,
  supervision_cost_pence: null,
  stripe_payment_intent_id: null,
  manual_payment_status: null,
  paid_at: null,
  google_event_id: null,
  imported_from_stub_id: null,
  send_reminders: true,
  created_at: new Date().toISOString(),
} as Session;

function seedStore(sessions: Session[]) {
  store.dispatch(fetchSessionsByClientId.fulfilled(sessions, "test", "client-1"));
  store.dispatch(fetchAvailability.fulfilled({ rules: [], overrides: [] }, "test", undefined));
}

function renderPage() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <ClientSchedule />
      </BrowserRouter>
    </Provider>,
  );
}

describe("ClientSchedule — clicking a calendar session", () => {
  it("opens a details modal with the session's own card when a session chip is clicked", () => {
    seedStore([baseSession]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "session-session-1" }));

    // Scoped to the dialog — the featured "next session" strip above the
    // calendar renders its own (unrelated) Reschedule button for the same
    // session, so a page-wide query would match both.
    const dialog = screen.getByRole("dialog", { name: "Session details" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
  });

  it("closes the modal via the close button", () => {
    seedStore([baseSession]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "session-session-1" }));
    expect(screen.getByRole("dialog", { name: "Session details" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog", { name: "Session details" })).not.toBeInTheDocument();
  });

  it("does not open a modal when a non-session event (availability buffer) is clicked", () => {
    seedStore([baseSession]);
    renderPage();

    // clientSessionEvents() also emits a "buffer-session-1" event for the
    // 10-minute gap after the session — that one isn't clickable by design.
    fireEvent.click(screen.getByRole("button", { name: "buffer-session-1" }));

    expect(screen.queryByRole("dialog", { name: "Session details" })).not.toBeInTheDocument();
  });

  it("opens the modal for a cancelled session too, showing its cancelled status", () => {
    const cancelled = { ...baseSession, id: "session-2", status: "cancelled" as const };
    seedStore([cancelled]);
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "session-session-2" }));

    const dialog = screen.getByRole("dialog", { name: "Session details" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/cancelled/i)).toBeInTheDocument();
  });
});

describe("ClientSchedule — featured next-session strip", () => {
  // Regression: a session auto-cancelled for non-payment kept a future
  // scheduled_at, so it still rendered as the featured "next session" with a
  // live Pay/Reschedule/Cancel strip, even though it no longer existed in any
  // actionable sense. The fix isn't to hide it (a session silently vanishing
  // is its own confusing UX) — it's to keep showing it as the next session,
  // but clearly marked cancelled with no actions to take on it.
  it("features a cancelled session clearly marked as cancelled instead of hiding it, with no Pay action", () => {
    const cancelled = { ...baseSession, status: "cancelled" as const, paid: false };
    seedStore([cancelled]);
    renderPage();

    expect(screen.queryByText("No upcoming sessions booked")).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
  });
});
