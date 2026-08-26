import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

const reloadSpy = vi.fn();

function mockLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadSpy, href: "" },
  });
}

function mockServiceWorker(registrations: ServiceWorkerRegistration[]) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue(registrations) },
  });
}

function mockCaches(cacheNames: string[]) {
  Object.defineProperty(window, "caches", {
    configurable: true,
    value: { keys: vi.fn().mockResolvedValue(cacheNames), delete: vi.fn().mockResolvedValue(true) },
  });
}

beforeEach(mockLocation);

afterEach(() => {
  cleanup();
  reloadSpy.mockClear();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children normally when nothing has crashed (happy path)", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("catches a render error and shows the fallback instead of a blank page (happy path)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: /oops, something went wrong/i })).toBeInTheDocument();
  });

  it("'Reload page' unregisters service workers and clears caches before reloading (happy path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unregister1 = vi.fn().mockResolvedValue(true);
    const unregister2 = vi.fn().mockResolvedValue(true);
    mockServiceWorker([
      { unregister: unregister1 } as unknown as ServiceWorkerRegistration,
      {
        unregister: unregister2,
      } as unknown as ServiceWorkerRegistration,
    ]);
    mockCaches(["workbox-precache-v1", "workbox-runtime-v1"]);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
    expect(unregister1).toHaveBeenCalled();
    expect(unregister2).toHaveBeenCalled();
    expect(window.caches.delete).toHaveBeenCalledWith("workbox-precache-v1");
    expect(window.caches.delete).toHaveBeenCalledWith("workbox-runtime-v1");
  });

  it("'Reload page' still reloads when there's nothing to unregister or clear (sad path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockServiceWorker([]);
    mockCaches([]);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });

  it("'Reload page' still reloads even if clearing the service worker/caches throws (sad path)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockRejectedValue(new Error("blocked")) },
    });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });

  it("'Go to dashboard' does a full navigation to / rather than a router link (happy path)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));

    expect(window.location.href).toBe("/");
  });
});
