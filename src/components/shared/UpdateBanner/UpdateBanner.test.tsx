import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UpdateBanner from "./UpdateBanner";

declare const __APP_VERSION__: string;

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

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  });
});

afterEach(() => {
  cleanup();
  reloadSpy.mockClear();
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

  it("'Update now' shows an updating state and falls back to a reload with no service worker registered (happy path)", async () => {
    mockDisplayMode({ standalone: true });
    mockVersionResponse("99.0.0-newer");
    render(<UpdateBanner />);

    fireEvent.click(await screen.findByRole("button", { name: /update now/i }));

    expect(await screen.findByRole("button", { name: /updating/i })).toBeDisabled();
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });
});
