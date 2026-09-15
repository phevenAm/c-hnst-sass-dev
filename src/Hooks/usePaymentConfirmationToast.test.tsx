import { act, cleanup, fireEvent, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/context/ToastContext";
import { usePaymentConfirmationToast } from "./usePaymentConfirmationToast";

// New (2026-09-14) shared hook behind every "mark as paid" action — zero
// coverage before this file. Every caller-side test (SessionCard.test.tsx,
// BlockSessionCard.test.tsx, StubSessionCard) mocks useToast entirely, so
// nothing anywhere actually drove the real "click Send email" interaction
// through to the edge-function call it's supposed to make — exactly the
// "renders but was never clicked" gap flagged in the SplitButton incident.

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

function renderOffer() {
  return renderHook(() => usePaymentConfirmationToast(), { wrapper: ToastProvider });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("usePaymentConfirmationToast — no client email", () => {
  it("shows a plain success toast and never calls the edge function (happy path)", () => {
    const { result } = renderOffer();
    act(() => result.current(false, { type: "session", sessionId: "sess-1" }, "Marked as paid."));

    expect(screen.getByRole("status")).toHaveTextContent("Marked as paid.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("defaults the message to 'Marked as paid.' when none is given", () => {
    const { result } = renderOffer();
    act(() => result.current(false, { type: "session", sessionId: "sess-1" }));

    expect(screen.getByRole("status")).toHaveTextContent("Marked as paid.");
  });
});

describe("usePaymentConfirmationToast — has client email, session target", () => {
  it("clicking 'Send email' invokes send-payment-notification with the session id, then confirms (happy path)", async () => {
    invoke.mockResolvedValue({ error: null });
    const { result } = renderOffer();
    act(() => result.current(true, { type: "session", sessionId: "sess-42" }));

    const button = screen.getByRole("button", { name: "Send email" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(invoke).toHaveBeenCalledWith("send-payment-notification", { body: { session_id: "sess-42" } });
    expect(screen.getByRole("status")).toHaveTextContent("Confirmation email sent.");
  });

  it("shows a failure toast when the edge function errors (sad path)", async () => {
    invoke.mockResolvedValue({ error: { message: "boom" } });
    const { result } = renderOffer();
    act(() => result.current(true, { type: "session", sessionId: "sess-42" }));

    const button = screen.getByRole("button", { name: "Send email" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't send the confirmation email.");
  });
});

describe("usePaymentConfirmationToast — has client email, stub target", () => {
  it("clicking 'Send email' invokes notify-stub-payment-recorded with the stub session id (regression — must not reuse the session fn/body shape)", async () => {
    invoke.mockResolvedValue({ error: null });
    const { result } = renderOffer();
    act(() => result.current(true, { type: "stub", stubSessionId: "stub-sess-7" }));

    const button = screen.getByRole("button", { name: "Send email" });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(invoke).toHaveBeenCalledWith("notify-stub-payment-recorded", { body: { stub_session_id: "stub-sess-7" } });
  });
});
