import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import UpdateBanner from "./UpdateBanner";

declare const __APP_VERSION__: string;

// showSplash() re-uses app.html's #boot-splash-mark markup (one copy, no
// duplicate SVG in the codebase). jsdom never loads app.html, so pull that
// node's contents straight from the real file and seed it before each test —
// bootSplash.ts's fallback reads #boot-splash-mark from the live DOM.
// Vitest runs with the repo root as cwd.
const APP_HTML = readFileSync(resolve(process.cwd(), "app.html"), "utf-8");
const BOOT_SPLASH_MARK_INNER = APP_HTML.match(/<div id="boot-splash-mark"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";

function mockDisplayMode({ standalone, iosStandalone = false }: { standalone: boolean; iosStandalone?: boolean }) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(display-mode: standalone)" ? standalone : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    value: iosStandalone,
  });
}

function mockVersionResponse(version: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: () => Promise.resolve({ version }) } as unknown as Response),
  );
}

const reloadSpy = vi.fn();
const replaceSpy = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadSpy, replace: replaceSpy, href: "https://example.com/settings" },
  });

  const mark = document.createElement("div");
  mark.id = "boot-splash-mark";
  mark.innerHTML = BOOT_SPLASH_MARK_INNER;
  document.body.appendChild(mark);
});

afterEach(() => {
  cleanup();
  // showSplash() appends a plain-DOM #boot-splash node to <body> and never
  // removes it (the real code relies on the reload it triggers). Clear it by
  // hand so its dedupe guard doesn't carry a stale splash into the next test.
  document.getElementById("boot-splash")?.remove();
  document.getElementById("boot-splash-mark")?.remove();
  reloadSpy.mockClear();
  replaceSpy.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UpdateBanner", () => {
  it("shows the update prompt when installed as a PWA and a newer version is live (happy path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    expect(await screen.findByText(/a new version is available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /later/i })).toBeInTheDocument();
  });

  it("detects standalone mode via iOS's navigator.standalone flag too (happy path)", async () => {
    mockDisplayMode({ standalone: false, iosStandalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    expect(await screen.findByText(/a new version is available/i)).toBeInTheDocument();
  });

  it("stays hidden in a regular browser tab even when a newer version is live (sad path)", async () => {
    mockDisplayMode({ standalone: false });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/a new version is available/i)).not.toBeInTheDocument();
  });

  it("stays hidden in the PWA when already on the current version (sad path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse(__APP_VERSION__);
    render(<UpdateBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/a new version is available/i)).not.toBeInTheDocument();
  });

  it("stays hidden and doesn't throw when the version check fails (sad path)", async () => {
    mockDisplayMode({ standalone: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<UpdateBanner />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/a new version is available/i)).not.toBeInTheDocument();
  });

  it("'Later' dismisses the banner (happy path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    fireEvent.click(await screen.findByRole("button", { name: /later/i }));

    expect(screen.queryByText(/a new version is available/i)).not.toBeInTheDocument();
  });

  it("'Update now' shows an updating state and falls back to a cache-busting navigation with no service worker registered (happy path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    fireEvent.click(await screen.findByRole("button", { name: /update now/i }));

    expect(await screen.findByRole("button", { name: /updating/i })).toBeDisabled();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining("force-update=")));
  });

  it("'Update now' covers the whole app with the sapling 'Updating…' splash while the reload is pending (happy path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    // No splash until the user actually asks for the update.
    expect(document.getElementById("boot-splash")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: /update now/i }));

    const splash = await waitFor(() => {
      const el = document.getElementById("boot-splash");
      if (!el) throw new Error("updating splash not shown");
      return el;
    });

    // The sapling mark, the "loading" caption, and a full-screen top-of-stack
    // overlay that's announced to assistive tech.
    expect(splash.querySelector("svg")).toBeInTheDocument();
    expect(splash).toHaveTextContent(/updating/i);
    expect(splash.getAttribute("role")).toBe("status");
    expect(splash.getAttribute("aria-live")).toBe("polite");
    expect(splash.style.position).toBe("fixed");
  });
});
