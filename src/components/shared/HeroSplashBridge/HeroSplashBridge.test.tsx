import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HeroSplashBridge from "./HeroSplashBridge";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.__authReady = undefined;
});

let authLoading = false;
vi.mock("@context/AuthContext", () => ({ useAuth: () => ({ loading: authLoading }) }));

let pathname = "/admin/clients";
vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname }) }));

let state = { userDirectory: { status: "succeeded" }, sessions: { status: "succeeded" } };
vi.mock("@store/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(state),
}));

function firedAuthReady(spy: ReturnType<typeof vi.spyOn>): boolean {
  return spy.mock.calls.some((call) => (call[0] as Event).type === "clarity:auth-ready");
}

describe("HeroSplashBridge", () => {
  beforeEach(() => {
    authLoading = false;
    pathname = "/admin/clients";
    state = { userDirectory: { status: "succeeded" }, sessions: { status: "succeeded" } };
  });

  it("fires clarity:auth-ready once auth resolves on a non-dashboard route, regardless of data status (unaffected behaviour)", () => {
    pathname = "/admin/clients";
    state = { userDirectory: { status: "loading" }, sessions: { status: "idle" } };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(true);
    expect(window.__authReady).toBe(true);
  });

  it("does NOT fire on the dashboard route while its own data is still loading (regression — double loading moment)", () => {
    pathname = "/admin";
    state = { userDirectory: { status: "loading" }, sessions: { status: "succeeded" } };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(false);
    expect(window.__authReady).toBeUndefined();
  });

  it("does NOT fire on the dashboard route while data hasn't even started fetching yet (idle)", () => {
    pathname = "/admin";
    state = { userDirectory: { status: "idle" }, sessions: { status: "idle" } };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(false);
  });

  it("fires on the dashboard route once both users and sessions have resolved (happy path)", () => {
    pathname = "/admin";
    state = { userDirectory: { status: "succeeded" }, sessions: { status: "succeeded" } };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(true);
  });

  it("fires on the dashboard route even if one fetch failed, rather than hanging the splash forever (sad path)", () => {
    pathname = "/admin";
    state = { userDirectory: { status: "failed" }, sessions: { status: "succeeded" } };
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(true);
  });

  it("does not fire at all while auth itself is still loading, even off the dashboard route", () => {
    authLoading = true;
    pathname = "/admin/clients";
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<HeroSplashBridge />);

    expect(firedAuthReady(dispatchSpy)).toBe(false);
  });
});
