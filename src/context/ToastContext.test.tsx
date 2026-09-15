import { act, cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./ToastContext";

// The action-button + variable-duration behaviour here is new (2026-09-14,
// alongside usePaymentConfirmationToast — see that hook's test for the
// end-to-end "click Send email" coverage) and had zero test coverage: every
// consumer (SessionCard.test.tsx etc.) mocks useToast entirely, so nothing
// in the suite actually exercised the real timer/dismiss/action logic below.

function renderToast() {
  return renderHook(() => useToast(), { wrapper: ToastProvider });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastContext — plain toast", () => {
  it("renders the message with role=status and no action button (happy path)", () => {
    const { result } = renderToast();
    act(() => result.current.showToast("Saved.", "success"));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Saved.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("auto-dismisses after 3.5s when there is no action (sad path — confirms it doesn't linger)", () => {
    vi.useFakeTimers();
    const { result } = renderToast();
    act(() => result.current.showToast("Saved."));

    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ToastContext — action toast", () => {
  it("clicking the action button calls onClick and dismisses the toast (happy path)", () => {
    const onClick = vi.fn();
    const { result } = renderToast();
    act(() => result.current.showToast("Marked as paid.", "success", { label: "Send email", onClick }));

    const button = screen.getByRole("button", { name: "Send email" });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("stays up past the plain 3.5s duration and only auto-dismisses at 12s (regression — action toasts need longer to read+click)", () => {
    vi.useFakeTimers();
    const { result } = renderToast();
    act(() => result.current.showToast("Marked as paid.", "success", { label: "Send email", onClick: vi.fn() }));

    act(() => vi.advanceTimersByTime(3500));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(8500));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ToastContext — re-triggering", () => {
  beforeEach(() => vi.useFakeTimers());

  it("a second showToast before the first's timer fires replaces the message and resets the timer (sad path)", () => {
    const { result } = renderToast();
    act(() => result.current.showToast("First.", "success", { label: "Undo", onClick: vi.fn() }));

    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.showToast("Second."));

    // Second toast is plain (no action) so it's governed by the 3.5s
    // duration counted from when it was shown, not the first's longer
    // action-toast timer — if the old timer had leaked it would wrongly
    // keep "Second." alive well past 3.5s-from-second-call.
    act(() => vi.advanceTimersByTime(3499));
    expect(screen.getByText("Second.")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a second action toast's button fires the NEW onClick, not a stale reference to the first's (edge case)", () => {
    const firstOnClick = vi.fn();
    const secondOnClick = vi.fn();
    const { result } = renderToast();

    act(() => result.current.showToast("First.", "success", { label: "Undo", onClick: firstOnClick }));
    act(() => result.current.showToast("Second.", "success", { label: "Undo", onClick: secondOnClick }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(secondOnClick).toHaveBeenCalledTimes(1);
    expect(firstOnClick).not.toHaveBeenCalled();
  });
});

describe("ToastContext — edge cases", () => {
  // KNOWN GAP, not a desired behaviour: the toast div is gated on
  // `{message && (...)}`, and "" is falsy in JS — so showToast("") sets
  // state correctly but the toast never renders at all. No current caller
  // passes an empty string, so this hasn't bitten anyone yet, but it would
  // silently eat any future "" message. Flagging here rather than fixing —
  // the fix (`message !== null` instead of truthiness) is a one-line change
  // to this FE file, Stephen's call whether it's worth making.
  it("an empty-string message is silently swallowed instead of shown (documents the falsy-string gap)", () => {
    const { result } = renderToast();
    act(() => result.current.showToast(""));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
