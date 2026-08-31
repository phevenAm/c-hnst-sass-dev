import { Provider } from "react-redux";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import practiceSettingsReducer from "@store/slices/practiceSettingsSlice";
import sessionsReducer from "@store/slices/sessionsSlice";

import CreateSessionModal from "./CreateSessionModal";

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

function renderModal(props: Partial<React.ComponentProps<typeof CreateSessionModal>> = {}) {
  const store = configureStore({ reducer: { sessions: sessionsReducer, practiceSettings: practiceSettingsReducer } });
  const onClose = vi.fn();
  const utils = render(
    <Provider store={store}>
      <CreateSessionModal clientId="client-1" clientName="Ada Lovelace" onClose={onClose} {...props} />
    </Provider>,
  );
  return { store, onClose, ...utils };
}

// Session types configured in Settings (session_packages) previously had no
// way to be applied when actually booking a session — Settings' own copy
// promised "this is what you'll pick from when booking", which was false.
describe("CreateSessionModal — session type picker", () => {
  it("prefills duration and price when a session type is selected (happy path)", async () => {
    renderModal();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-2" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Session fee (£)")).toHaveValue(90);
    });
    expect(document.querySelector("#session-duration")).toHaveValue(80);
  });

  it("leaves duration and price editable after picking a type (happy path)", async () => {
    renderModal();

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toHaveValue(60));

    fireEvent.change(screen.getByLabelText("Session fee (£)"), { target: { value: "45" } });
    expect(screen.getByLabelText("Session fee (£)")).toHaveValue(45);
  });

  it("does not show the picker when no session types are configured (sad path)", async () => {
    packageRows = [];
    renderModal();

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
    await screen.findByRole("combobox");
    expect(screen.queryByRole("checkbox", { name: /recurring block/i })).not.toBeInTheDocument();
    expect(document.querySelector("#recurring")).not.toBeInTheDocument();
  });

  it("relabels the fee as a block fee and shows the per-session split when a recurring type is picked", async () => {
    renderModal();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });

    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toHaveValue(240));
    expect(screen.getByTestId("per-session-fee")).toHaveTextContent("Each session shows £60.00.");
    // The block explainer is shown (pulled from the type, not a manual checkbox).
    expect(screen.getByTestId("recurring-summary")).toHaveTextContent(
      "Creates 4 sessions, one week apart starting from the date above. They're tracked and paid together — marking any one of them as paid marks the whole block as paid.",
    );
    // The "Schedule sessions" (plural) button confirms block mode is on.
    expect(screen.getByRole("button", { name: "Schedule sessions" })).toBeInTheDocument();
  });

  it("switching back to Custom clears block mode", async () => {
    renderModal();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toBeInTheDocument());

    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toBeInTheDocument());
    expect(screen.queryByTestId("per-session-fee")).not.toBeInTheDocument();
  });
});

describe("CreateSessionModal — saving a block", () => {
  const start = dayjs("2026-09-01T10:00:00.000Z");

  it("creates one session per week, splits the block price evenly, and stamps shared block metadata", async () => {
    insertedRows.length = 0;
    insertedCount = 0;
    const { store, onClose } = renderModal({ initialStart: start });

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toHaveValue(240));

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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toBeInTheDocument());

    // £100.01 → 10001p, 10001 / 4 → floor 2500 each, remainder 1p on the first.
    fireEvent.change(document.querySelector("#session-price")!, { target: { value: "100.01" } });
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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toBeInTheDocument());

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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toHaveValue(60));

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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toHaveValue(60));

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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-3" } });
    await waitFor(() => expect(screen.getByLabelText("Block fee (£) — covers 4 sessions")).toHaveValue(240));

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

    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "pkg-1" } });
    await waitFor(() => expect(screen.getByLabelText("Session fee (£)")).toHaveValue(60));

    fireEvent.click(screen.getByRole("button", { name: "Schedule session" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().sessions.sessions).toHaveLength(1);
  });
});
