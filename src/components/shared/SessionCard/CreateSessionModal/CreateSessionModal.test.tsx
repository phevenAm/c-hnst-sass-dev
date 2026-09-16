import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import practiceSettingsReducer from "@store/slices/practiceSettingsSlice";
import sessionsReducer from "@store/slices/sessionsSlice";

import CreateSessionModal from "./CreateSessionModal";

const INTRO_SEEN_KEY = "create_session_modal_intro_seen";

// Every test in this file except the dedicated "first-time intro" describe
// below is written for the real step content — seed the "already seen"
// flag so the modal opens straight onto the Date & location step, same as
// it always has for a returning admin.
beforeEach(() => {
  window.localStorage.setItem(INTRO_SEEN_KEY, "true");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  rpcConflict.queue = [];
  rpcConflict.fallback = false;
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ authUser: { id: "admin-1" }, isDemo: false }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// DateInput pulls in MUI X's date pickers, which need a LocalizationProvider
// this test has no reason to set up — irrelevant to what's under test here.
vi.mock("@components/shared/DateInput/DateInput", () => ({ default: () => <div /> }));

type PackageRow = {
  id: string;
  name: string;
  price_pence: number;
  duration_minutes: number;
  is_recurring: boolean;
  session_count: number;
};

let packageRows: PackageRow[] = [
  {
    id: "pkg-1",
    name: "Standard session",
    price_pence: 6000,
    duration_minutes: 50,
    is_recurring: false,
    session_count: 1,
  },
  {
    id: "pkg-2",
    name: "Extended session",
    price_pence: 9000,
    duration_minutes: 80,
    is_recurring: false,
    session_count: 1,
  },
  // A recurring block: £240 covers 4 weekly sessions → £60 each.
  { id: "pkg-3", name: "6-week block", price_pence: 24000, duration_minutes: 50, is_recurring: true, session_count: 4 },
];

// Every session insert echoes the row back with a fresh id so the slice's
// createSession.fulfilled has something distinct to push — lets a test read
// the created rows straight off the store afterwards.
let insertedCount = 0;
const insertedRows: any[] = [];

const invokeMock = vi.fn(() => Promise.resolve({ data: null, error: null }));

// practice_slot_has_conflict — flip per test to simulate a taken slot. `queue`
// is consumed one entry per call so a test can make only the 2nd block date
// clash; otherwise `fallback` is returned.
const rpcConflict = { queue: [] as boolean[], fallback: false };
const rpcMock = vi.fn((name: string, _params?: unknown) => {
  if (name === "practice_slot_has_conflict") {
    const next = rpcConflict.queue.length ? rpcConflict.queue.shift() : rpcConflict.fallback;
    return Promise.resolve({ data: next, error: null });
  }
  return Promise.resolve({ data: null, error: null });
});

vi.mock("@/lib/supabase.js", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    rpc: (name: string, params?: unknown) => rpcMock(name, params),
    from: (table: string) => {
      if (table === "session_packages") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: packageRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "sessions") {
        return {
          insert: (row: any) => ({
            select: () => ({
              single: () => {
                const created = {
                  ...row,
                  id: `s-${++insertedCount}`,
                  created_at: new Date().toISOString(),
                  status: "scheduled",
                };
                insertedRows.push(created);
                return Promise.resolve({ data: created, error: null });
              },
            }),
          }),
        };
      }
      // practice_settings — hit by useFetchOnIdle's shared-cache fetch on mount.
      return {
        select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      };
    },
  },
}));

// The modal is now paginated into steps; the Schedule/Update button only
// exists on the final one. Click through however many "Next"s remain.
function advanceToFinalStep() {
  let next = screen.queryByRole("button", { name: "Next" });
  while (next) {
    fireEvent.click(next);
    next = screen.queryByRole("button", { name: "Next" });
  }
}

// Date & location -> Session & fee. Session type/duration/fee moved off the
// first step (see CreateSessionModal's 3-step regroup), so any test touching
// them needs one Next click first.
function goToSessionStep() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

function renderModal(props: Partial<React.ComponentProps<typeof CreateSessionModal>> = {}) {
  const store = configureStore({ reducer: { sessions: sessionsReducer, practiceSettings: practiceSettingsReducer } });
  const onClose = vi.fn();
  const utils = render(
    <Provider store={store}>
      <CreateSessionModal
        clientId="client-1"
        clientName="Ada Lovelace"
        onClose={onClose}
        // The date step now blocks Next until a date is picked, and DateInput
        // is mocked to an empty div here — default to a valid date so every
        // existing test (written for the old single-step layout) can still
        // reach the fields it cares about. Tests exercising the date gate
        // itself override this back to null.
        initialStart={dayjs("2026-09-01T10:00:00.000Z")}
        {...props}
      />
    </Provider>,
  );
  return { store, onClose, ...utils };
}

// A first-time admin sees a one-off "here's how this works" screen before
// the real step content; a returning one (the intro-seen flag set in the
// file-level beforeEach above) never does.
describe("CreateSessionModal — first-time intro", () => {
  beforeEach(() => {
    window.localStorage.removeItem(INTRO_SEEN_KEY);
  });

  it("shows the intro before the real fields on a first-ever open (happy path)", () => {
    renderModal();
    expect(screen.getByText("Booking a session takes 3 quick steps")).toBeInTheDocument();
    expect(screen.queryByText("Date & time")).not.toBeInTheDocument();
  });

  it("never shows it when editing an existing session (sad path — nothing to explain, it's a one-off edit)", () => {
    renderModal({
      session: {
        id: "sess-1",
        scheduled_at: "2026-09-01T10:00:00.000Z",
        duration_minutes: 50,
        price_pence: 6000,
      } as any,
    });
    expect(screen.queryByText("Booking a session takes 3 quick steps")).not.toBeInTheDocument();
    expect(screen.getByText("Date & time")).toBeInTheDocument();
  });

  it("moves on to the real step content on Get started, and never shows again after (regression)", () => {
    const { unmount } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));

    expect(screen.getByText("Date & time")).toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("true");

    unmount();
    renderModal();
    expect(screen.queryByText("Booking a session takes 3 quick steps")).not.toBeInTheDocument();
    expect(screen.getByText("Date & time")).toBeInTheDocument();
  });
});

// The 3-step regroup (Date & location / Session & fee / Confirm) added a
// requirement gate on Next that didn't exist before. Next stays clickable
// rather than disabled — clicking it while a required field is missing
// shows the reason instead of silently doing nothing, so the admin isn't
// left wondering why the button "doesn't work".
describe("CreateSessionModal — step validation", () => {
  it("clicking Next on the date step without a date shows why, and does not advance (regression — it used to just no-op)", () => {
    renderModal({ initialStart: null });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // Shown twice — a proactive hint under the field, and again in the
    // error slot once Next is actually clicked — either is fine here.
    expect(screen.getAllByText("Pick a date & time to continue.").length).toBeGreaterThan(0);
    // Still on the date step — Session location (step 1 content) never mounted.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("advances once a date is present, then blocks again on the fee step for a blank fee (with a reason)", () => {
    renderModal();
    goToSessionStep();
    expect(document.querySelector("#session-price")).toBeInTheDocument();

    fireEvent.change(document.querySelector("#session-price")!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByText("Enter a duration and fee to continue.").length).toBeGreaterThan(0);
    // Still on the fee step — Payment (step 2 content) never mounted.
    expect(screen.queryByText("Payment")).not.toBeInTheDocument();

    fireEvent.change(document.querySelector("#session-price")!, { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Payment")).toBeInTheDocument();
  });
});

// Closing (Cancel, the X, backdrop, Escape — all funnel through Modal's one
// onClose) used to discard silently. A dirty form now asks first, matching
// the "are you sure" pattern already used for cancel/delete elsewhere.
describe("CreateSessionModal — discard confirmation", () => {
  it("closes immediately when nothing has changed (happy path)", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before closing once something has changed, and only closes on confirm", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: "Remote" }));
    fireEvent.change(screen.getByPlaceholderText("Meeting link (optional)"), {
      target: { value: "https://example.com/call" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, discard" }));
    expect(onClose).toHaveBeenCalled();
  });
});

// Every session created for a block shares one reference_code (handleSave
// passes the same value to every row) — auto-filling it when a block type is
// picked is what actually makes that useful, instead of relying on the admin
// to remember to type one in themselves.
// Regression coverage (2026-09-16): an agency can lock a client's rate
// (client_stubs.default_rate_pence + allow_staff_custom_rate) so the
// assigned staff member can't charge more (or less) than agreed.
describe("CreateSessionModal — agency rate lock", () => {
  it("pins the fee to lockedPricePence, makes it read-only, and ignores a session-type pick", async () => {
    renderModal({ lockedPricePence: 4500 });
    goToSessionStep();

    expect(document.querySelector("#session-price")).toHaveValue(45);
    expect(document.querySelector("#session-price")).toHaveAttribute("readonly");
    expect(screen.getByText(/Set by your agency for this client/)).toBeInTheDocument();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-2" } }); // £90 package
    expect(document.querySelector("#session-price")).toHaveValue(45);
  });

  it("leaves the fee freely editable when no lock is passed", () => {
    renderModal();
    goToSessionStep();

    expect(document.querySelector("#session-price")).not.toHaveAttribute("readonly");
    expect(screen.queryByText(/Set by your agency for this client/)).not.toBeInTheDocument();
  });
});

describe("CreateSessionModal — block reference code auto-fill", () => {
  it("fills in a shared BLK- code when a recurring type is picked, visible on the Confirm step", async () => {
    renderModal();
    goToSessionStep();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));

    advanceToFinalStep();
    const codeInput = document.querySelector("#session-code") as HTMLInputElement;
    expect(codeInput.value).toMatch(/^BLK-[0-9A-F]{6}$/);
  });

  it("does not overwrite a reference code the admin typed themselves", async () => {
    renderModal();
    goToSessionStep();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));

    advanceToFinalStep();
    const codeInput = document.querySelector("#session-code") as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "MY-OWN-CODE" } });

    // Go back one step (Confirm -> Session & fee, where the picker lives) and
    // re-pick the same block type — a fresh auto-fill must not clobber what
    // was just typed by hand.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));

    advanceToFinalStep();
    expect((document.querySelector("#session-code") as HTMLInputElement).value).toBe("MY-OWN-CODE");
  });
});

// Session types configured in Settings (session_packages) previously had no
// way to be applied when actually booking a session — Settings' own copy
// promised "this is what you'll pick from when booking", which was false.
describe("CreateSessionModal — session type picker", () => {
  it("prefills duration and price when a session type is selected (happy path)", async () => {
    renderModal();
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-2" } });

    await waitFor(() => {
      expect(document.querySelector("#session-price")!).toHaveValue(90);
    });
    expect(document.querySelector("#session-duration")).toHaveValue(80);
  });

  it("leaves duration and price editable after picking a type (happy path)", async () => {
    renderModal();
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(60));

    fireEvent.change(document.querySelector("#session-price")!, { target: { value: "45" } });
    expect(document.querySelector("#session-price")!).toHaveValue(45);
  });

  it("does not show the picker when no session types are configured (sad path)", async () => {
    packageRows = [];
    renderModal();
    goToSessionStep();

    await waitFor(() => expect(document.querySelector("#session-duration")).toBeInTheDocument());
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    packageRows = [
      {
        id: "pkg-1",
        name: "Standard session",
        price_pence: 6000,
        duration_minutes: 50,
        is_recurring: false,
        session_count: 1,
      },
      {
        id: "pkg-2",
        name: "Extended session",
        price_pence: 9000,
        duration_minutes: 80,
        is_recurring: false,
        session_count: 1,
      },
      {
        id: "pkg-3",
        name: "6-week block",
        price_pence: 24000,
        duration_minutes: 50,
        is_recurring: true,
        session_count: 4,
      },
    ];
  });
});

// Recurrence is now a property of the session type, set in Settings — the
// old manual "Book as a recurring block" checkbox is gone. Picking a
// recurring type puts the form into block mode automatically.
describe("CreateSessionModal — recurring block from session type", () => {
  it("has no manual recurring checkbox", async () => {
    renderModal();
    goToSessionStep();
    await screen.findByRole("combobox");
    expect(screen.queryByRole("checkbox", { name: /recurring block/i })).not.toBeInTheDocument();
    expect(document.querySelector("#recurring")).not.toBeInTheDocument();
  });

  it("relabels the fee as a block fee and shows the per-session split when a recurring type is picked", async () => {
    renderModal();
    goToSessionStep();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });

    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));
    expect(screen.getByText("Block fee (£) — covers 4 sessions")).toBeInTheDocument();
    expect(screen.getByTestId("per-session-fee")).toHaveTextContent("Each session shows £60.00.");
    // The block explainer moved into the fee label's info tooltip (a "rich"
    // variant, which opens as its own modal) rather than a static paragraph —
    // it's still pulled from the type, not a manual checkbox, just revealed
    // on demand now instead of always shown.
    fireEvent.click(screen.getByRole("button", { name: "More information: Session Fee information" }));
    expect(
      await screen.findByText(/Creates 4 sessions, one week apart starting from the date above\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /They're tracked and paid together — marking any one of them as paid marks the whole block as paid\./,
      ),
    ).toBeInTheDocument();
    // The "Schedule sessions" (plural) button confirms block mode is on —
    // it only exists on the final step.
    advanceToFinalStep();
    expect(screen.getByRole("button", { name: "Schedule sessions" })).toBeInTheDocument();
  });

  it("switching back to Custom clears block mode", async () => {
    renderModal();
    goToSessionStep();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toBeInTheDocument());

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toBeInTheDocument());
    expect(screen.queryByTestId("per-session-fee")).not.toBeInTheDocument();
  });
});

describe("CreateSessionModal — saving a block", () => {
  const start = dayjs("2026-09-01T10:00:00.000Z");

  it("creates one session per week, splits the block price evenly, and stamps shared block metadata", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    const { store, onClose } = renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule sessions" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const created = [...store.getState().sessions.sessions].sort((a, b) =>
      a.scheduled_at.localeCompare(b.scheduled_at),
    );
    expect(created).toHaveLength(4);

    // One week apart, anchored on the picked date.
    expect(created.map((s) => s.scheduled_at)).toEqual([
      start.toISOString(),
      start.add(1, "week").toISOString(),
      start.add(2, "week").toISOString(),
      start.add(3, "week").toISOString(),
    ]);

    // £240 / 4 = £60 each; the rows sum back to the block total so
    // create-checkout-session (which sums the block) charges £240, not £960.
    expect(created.map((s) => s.price_pence)).toEqual([6000, 6000, 6000, 6000]);
    expect(created.reduce((sum, s) => sum + s.price_pence, 0)).toBe(24000);

    const blockIds = new Set(created.map((s) => (s.metadata as any).block_id));
    expect(blockIds.size).toBe(1);
    for (const s of created) {
      const meta = s.metadata as any;
      expect(meta.block_total).toBe(4);
      expect(meta.block_price_pence).toBe(24000);
      expect(meta.block_start).toBe(start.toISOString());
    }
  });

  it("puts the rounding remainder on the first session for a non-divisible block price", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    const { store } = renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toBeInTheDocument());

    // £100.01 → 10001p, 10001 / 4 → floor 2500 each, remainder 1p on the first.
    fireEvent.change(document.querySelector("#session-price")!, { target: { value: "100.01" } });
    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule sessions" }));

    await waitFor(() => expect(store.getState().sessions.sessions).toHaveLength(4));
    const created = [...store.getState().sessions.sessions].sort((a, b) =>
      a.scheduled_at.localeCompare(b.scheduled_at),
    );
    expect(created.map((s) => s.price_pence)).toEqual([2501, 2500, 2500, 2500]);
    // Still sums exactly to the block price the client is charged.
    expect(created.reduce((sum, s) => sum + s.price_pence, 0)).toBe(10001);
  });

  it("sends exactly one block-confirmation email, not one per session", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toBeInTheDocument());

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule sessions" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const blockCalls = invokeMock.mock.calls.filter((c) => c[0] === "notify-block-booked");
    const singleCalls = invokeMock.mock.calls.filter((c) => c[0] === "notify-session-booked");
    expect(blockCalls).toHaveLength(1);
    expect(singleCalls).toHaveLength(0);
    expect((blockCalls[0][1] as any).body.session_ids).toHaveLength(4);
  });

  it("a single (non-recurring) booking still sends one notify-session-booked", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(60));

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule session" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls.filter((c) => c[0] === "notify-session-booked")).toHaveLength(1);
    expect(invokeMock.mock.calls.filter((c) => c[0] === "notify-block-booked")).toHaveLength(0);
  });
});

// The overlap check now runs server-side (practice_slot_has_conflict), so it
// sees offline-client (stub) sessions too — not just whatever slice of
// state.sessions this page happens to hold.
describe("CreateSessionModal — double-booking guard", () => {
  const start = dayjs("2026-09-01T10:00:00.000Z");

  it("blocks the booking and inserts nothing when the slot is taken", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    rpcConflict.fallback = true; // practice_slot_has_conflict → true
    const { store, onClose } = renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(60));

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule session" }));

    await waitFor(() => expect(screen.getByText(/overlaps with an existing session/i)).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith(
      "practice_slot_has_conflict",
      expect.objectContaining({ p_admin_id: "admin-1" }),
    );
    expect(store.getState().sessions.sessions).toHaveLength(0);
    expect(insertedRows).toHaveLength(0);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates nothing when only the 2nd date of a block clashes", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    rpcConflict.queue = [false, true, false, false]; // 2nd weekly slot is taken
    const { store } = renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(240));

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule sessions" }));

    await waitFor(() => expect(screen.getByText(/overlaps with an existing session/i)).toBeInTheDocument());
    expect(store.getState().sessions.sessions).toHaveLength(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("goes ahead when the slot is free", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    rpcConflict.fallback = false;
    const { store, onClose } = renderModal({ initialStart: start });
    goToSessionStep();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(document.querySelector("#session-price")!).toHaveValue(60));

    advanceToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "Schedule session" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().sessions.sessions).toHaveLength(1);
  });
});
