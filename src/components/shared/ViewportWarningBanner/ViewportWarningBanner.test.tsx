import { MemoryRouter } from "react-router-dom";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ViewportWarningBanner from "./ViewportWarningBanner";

const DISMISS_KEY = "viewport_warning_dismissed";

// jsdom doesn't implement matchMedia — stub it so the component's narrow/wide
// check has something to read. `matches` is fixed per test via `narrow`;
// listener wiring is a no-op since no test needs to simulate a live resize.
function mockMatchMedia(narrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <ViewportWarningBanner />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ViewportWarningBanner", () => {
  it("queries the 350px breakpoint, not the general $bp-sm/640px breakpoint (happy path)", () => {
    const matchMediaSpy = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    window.matchMedia = matchMediaSpy;
    renderBanner();

    expect(matchMediaSpy).toHaveBeenCalledWith("(max-width: 349px)");
  });

  it("shows the warning with a working settings link on a narrow viewport (happy path)", () => {
    mockMatchMedia(true);
    renderBanner();

    expect(screen.getByRole("status")).toHaveTextContent(/works best on a larger screen/i);
    expect(screen.getByRole("link", { name: /settings → interface/i })).toHaveAttribute("href", "/settings");
  });

  it("renders nothing on a wide viewport (sad path)", () => {
    mockMatchMedia(false);
    renderBanner();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing on a narrow viewport if already dismissed (sad path)", () => {
    window.localStorage.setItem(DISMISS_KEY, "true");
    mockMatchMedia(true);
    renderBanner();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismissing hides the banner and persists the choice (happy path)", () => {
    mockMatchMedia(true);
    renderBanner();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("true");
  });

  it("dismissing still hides the banner for this render when localStorage throws (sad path)", () => {
    mockMatchMedia(true);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled (private mode)");
    });
    renderBanner();

    expect(() => fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))).not.toThrow();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reads a blocked localStorage as 'not dismissed' rather than throwing on mount (sad path)", () => {
    mockMatchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled (private mode)");
    });

    expect(() => renderBanner()).not.toThrow();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // Regression test for the 2026-08-26 production crash: this banner was
  // rendered as a sibling of <AppRoutes /> in App.tsx, i.e. outside the
  // <BrowserRouter> that AppRoutes declares internally. Its <Link> then threw
  // "Cannot destructure property 'basename' of useContext(...) as it is
  // null" for every narrow-viewport visitor who hadn't already dismissed it
  // (any first-time or incognito/reinstalled-PWA visit), crashing the whole
  // app to the ErrorBoundary fallback. It's since been moved inside
  // <BrowserRouter> in Router.tsx — this asserts it stays there.
  it("throws when rendered without a Router ancestor, guarding against the App.tsx regression (sad path)", () => {
    mockMatchMedia(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<ViewportWarningBanner />)).toThrow();

    consoleError.mockRestore();
  });
});
