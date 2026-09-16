import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@context/ToastContext";
import type { StubSession } from "@models/globalTypes";

import clientStubsReducer from "@/store/slices/clientStubsSlice";
import userDirectoryReducer from "@/store/slices/userDirectorySlice";
import StubSessionCard from "./StubSessionCard";

// Zero coverage before this file, on a component this session's diff already
// touches (the payment-confirmation-email offer). Money toggling here is
// block-aware (a whole block gets marked paid/unpaid in one write) and the
// Cancel/Delete paths are destructive with a client-notify checkbox that
// nothing exercised — this covers the actual DB calls those actions make,
// not just that the buttons render.

const URL_ID = "real-client-1";

const { supabaseMock, updateSpy, deleteSpy, eqSpy, filterSpy, invokeSpy, nextResult } = vi.hoisted(() => {
  const nextResult = { value: { data: null as unknown, error: null as unknown } };
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const eqSpy = vi.fn();
  const filterSpy = vi.fn();
  const singleSpy = vi.fn();
  const invokeSpy = vi.fn(() => Promise.resolve({ error: null }));

  // biome-ignore lint/suspicious/noExplicitAny: minimal chainable query-builder stub
  const chain: any = {};
  chain.update = (...a: unknown[]) => {
    updateSpy(...a);
    return chain;
  };
  chain.delete = (...a: unknown[]) => {
    deleteSpy(...a);
    return chain;
  };
  chain.eq = (...a: unknown[]) => {
    eqSpy(...a);
    return chain;
  };
  chain.filter = (...a: unknown[]) => {
    filterSpy(...a);
    return chain;
  };
  chain.select = () => chain;
  chain.single = () => {
    singleSpy();
    return Promise.resolve(nextResult.value);
  };
  // biome-ignore lint/suspicious/noThenProperty: deliberately thenable so `await scoped.select()` (no .single()) resolves like the real supabase-js query builder
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(nextResult.value).then(resolve, reject);

  return {
    nextResult,
    updateSpy,
    deleteSpy,
    eqSpy,
    filterSpy,
    singleSpy,
    invokeSpy,
    supabaseMock: { from: vi.fn(() => chain), functions: { invoke: invokeSpy } },
  };
});
vi.mock("@lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lib/supabase")>();
  return { ...actual, supabase: supabaseMock };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nextResult.value = { data: null, error: null };
});

const baseSession: StubSession = {
  id: "stub-sess-1",
  stub_id: "stub-1",
  admin_id: "admin-1",
  scheduled_at: "2099-01-01T09:00:00.000Z",
  duration_minutes: 50,
  status: "scheduled",
  price_pence: 6000,
  paid: false,
  amount_paid: null,
  currency: "GBP",
  notes: null,
  code: null,
  location: null,
  created_at: "2026-01-01T00:00:00.000Z",
  metadata: null,
};

function renderCard(session: Partial<StubSession> = {}, hasEmailStub = false, isDemo = false) {
  const store = configureStore({
    reducer: { userDirectory: userDirectoryReducer, clientStubs: clientStubsReducer },
    preloadedState: {
      userDirectory: { users: [], status: "idle", error: null },
      clientStubs: {
        stubs: hasEmailStub
          ? [
              {
                id: URL_ID,
                created_by: "admin-1",
                linked_user_id: null,
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                codename: null,
                created_at: "2026-01-01T00:00:00Z",
              },
            ]
          : [],
        status: "idle",
        error: null,
      },
    },
  });

  const onUpdated = vi.fn();
  const onDeleted = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/admin/stubs/${URL_ID}`]}>
      <Provider store={store}>
        <ToastProvider>
          <StubSessionCard
            session={{ ...baseSession, ...session }}
            sessionNumber={1}
            stubId="stub-1"
            adminId="admin-1"
            isDemo={isDemo}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
        </ToastProvider>
      </Provider>
    </MemoryRouter>,
  );
  return { onUpdated, onDeleted };
}

// The desktop Button and the mobile SplitButton's primary action render
// simultaneously in jsdom (no real CSS media query hides either) and share
// the same accessible name — the desktop one renders first in source order,
// same disambiguation SessionCard.test.tsx needs for its own paid toggle.
function clickDesktopButton(name: string | RegExp) {
  fireEvent.click(screen.getAllByRole("button", { name })[0]);
}

describe("StubSessionCard — mark as paid", () => {
  it("opens a confirm step with an email checkbox (checked by default), then marks paid and emails on confirm (happy path)", async () => {
    nextResult.value = { data: [{ ...baseSession, paid: true }], error: null };
    const { onUpdated } = renderCard({}, true);

    clickDesktopButton("Mark as paid");
    // Nothing written yet — marking paid now opens a confirm step instead of
    // firing the write immediately and offering to email via a toast button.
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("checkbox")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Yes, mark paid" }));

    expect(updateSpy).toHaveBeenCalledWith({ paid: true });
    expect(eqSpy).toHaveBeenCalledWith("id", "stub-sess-1");
    expect(filterSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith([{ ...baseSession, paid: true }]));
    await vi.waitFor(() =>
      expect(invokeSpy).toHaveBeenCalledWith("notify-stub-payment-recorded", {
        body: { stub_session_id: "stub-sess-1" },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Marked as paid — confirmation email sent.");
  });

  it("skips the email when the admin unchecks the box first (regression — the checkbox must actually gate the call)", async () => {
    nextResult.value = { data: [{ ...baseSession, paid: true }], error: null };
    renderCard({}, true);

    clickDesktopButton("Mark as paid");
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, mark paid" }));

    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ paid: true }));
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Marked as paid.");
  });

  it("has no email checkbox when the client has no email on file", async () => {
    nextResult.value = { data: [{ ...baseSession, paid: true }], error: null };
    renderCard({}, false);

    clickDesktopButton("Mark as paid");
    expect(await screen.findByRole("button", { name: "Yes, mark paid" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("scopes the update to the whole block (not just this row) when the session has a block_id", async () => {
    nextResult.value = { data: [], error: null };
    renderCard({ metadata: { block_id: "block-9" } });

    clickDesktopButton("Mark as paid");
    fireEvent.click(await screen.findByRole("button", { name: "Yes, mark paid" }));

    await vi.waitFor(() => expect(eqSpy).toHaveBeenCalledWith("stub_id", "stub-1"));
    expect(filterSpy).toHaveBeenCalledWith("metadata->>block_id", "eq", "block-9");
  });

  it("clears both paid and amount_paid when unmarking — a direct one-click toggle, nothing to confirm (sad path)", async () => {
    nextResult.value = { data: [{ ...baseSession, paid: false }], error: null };
    renderCard({ paid: true, amount_paid: 60 });

    clickDesktopButton("Mark as unpaid");

    expect(updateSpy).toHaveBeenCalledWith({ paid: false, amount_paid: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Yes, mark paid" })).not.toBeInTheDocument();
  });

  it("shows a failure toast and does not call onUpdated when the write errors", async () => {
    nextResult.value = { data: null, error: { message: "boom" } };
    const { onUpdated } = renderCard();

    clickDesktopButton("Mark as paid");
    fireEvent.click(await screen.findByRole("button", { name: "Yes, mark paid" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Failed to update.");
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("StubSessionCard — delete", () => {
  it("only deletes after the confirm step, calling the real delete and onDeleted (happy path)", async () => {
    nextResult.value = { data: null, error: null };
    const { onDeleted } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // Not deleted yet — still needs explicit confirmation.
    expect(deleteSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Yes, delete" }));

    // onDeleted is the last thing handleConfirmDelete does — deleteSpy fires
    // synchronously on click, before the write's promise even resolves.
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith("stub-sess-1"));
    expect(deleteSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith("id", "stub-sess-1");
  });
});

describe("StubSessionCard — cancel + notify checkbox", () => {
  it("cancels and emails the client by default (checkbox starts checked)", async () => {
    nextResult.value = { data: { ...baseSession, status: "cancelled" }, error: null };
    renderCard({}, true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, cancel it" }));

    await vi.waitFor(() =>
      expect(invokeSpy).toHaveBeenCalledWith("notify-stub-session-cancelled", {
        body: { stub_session_id: "stub-sess-1" },
      }),
    );
  });

  it("skips the email when the admin unchecks the notify box first (regression — the checkbox must actually gate the call)", async () => {
    nextResult.value = { data: { ...baseSession, status: "cancelled" }, error: null };
    renderCard({}, true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ status: "cancelled" }));
    expect(invokeSpy).not.toHaveBeenCalled();
  });
});

describe("StubSessionCard — demo mode", () => {
  it("blocks the paid toggle, shows the demo warning, and never touches the DB (happy path)", () => {
    renderCard({}, false, true);

    clickDesktopButton("Mark as paid");

    expect(screen.getByRole("status")).toHaveTextContent(/demo mode/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("also blocks opening the delete confirmation, not just the write itself (confirms the guard isn't bypassed via a different button)", () => {
    renderCard({}, false, true);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("status")).toHaveTextContent(/demo mode/i);
    expect(screen.queryByRole("button", { name: "Yes, delete" })).not.toBeInTheDocument();
  });
});

describe("StubSessionCard — edge cases", () => {
  it("falls back to a plain symbol + toFixed when Intl.NumberFormat rejects the currency code (paid pill's title)", () => {
    // "XX" is not a well-formed ISO 4217 code (must be 3 letters) —
    // Intl.NumberFormat throws a RangeError for it, which formatAmount's
    // try/catch is specifically there to survive. (Note: "XXX" is actually
    // valid — reserved by the standard for "no currency" — and does NOT throw.)
    renderCard({ paid: true, amount_paid: 42, currency: "XX" });

    const pill = screen.getByTitle("£42.00");
    expect(pill).toBeInTheDocument();
  });

  it("treats a null price_pence as £0 rather than crashing when marking paid", async () => {
    nextResult.value = { data: [{ ...baseSession, price_pence: null, paid: true }], error: null };
    const { onUpdated } = renderCard({ price_pence: null });

    clickDesktopButton("Mark as paid");
    fireEvent.click(await screen.findByRole("button", { name: "Yes, mark paid" }));

    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(updateSpy).toHaveBeenCalledWith({ paid: true });
  });

  it("only fires one edge-function call even if the confirm button is clicked twice before it resolves (no double-send)", async () => {
    let resolveInvoke: (v: { error: null }) => void = () => {};
    invokeSpy.mockImplementationOnce(() => new Promise((res) => (resolveInvoke = res)));
    nextResult.value = { data: [{ ...baseSession, paid: true }], error: null };
    renderCard({}, true);

    clickDesktopButton("Mark as paid");
    const confirmBtn = await screen.findByRole("button", { name: "Yes, mark paid" });
    fireEvent.click(confirmBtn);
    // Confirming disables the button via ConfirmModal's `confirming` prop —
    // a second click while the write/email is still in flight hits nothing.
    fireEvent.click(confirmBtn);

    resolveInvoke({ error: null });
    await vi.waitFor(() => expect(invokeSpy).toHaveBeenCalledTimes(1));
  });
});
