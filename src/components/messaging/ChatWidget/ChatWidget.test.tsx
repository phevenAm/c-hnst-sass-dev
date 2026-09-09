import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatWidget from "./ChatWidget";

// ── Mocks ───────────────────────────────────────────────────────────────────
// The widget is mounted app-wide (router root), so its "should I even be on
// screen" logic is what matters most: it only shows once there's a real
// conversation to return to.

const authValue = {
  authUser: { id: "me" },
  isAdmin: false,
  userProfile: { id: "me", admin_id: "admin-1" },
  isDemo: false,
  loading: false,
};
const mockUseAuth = vi.fn();
vi.mock("@context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/dashboard" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/featureFlags", () => ({ isFeatureEnabled: () => true }));

// Drive useAppSelector off a tiny fake state; the widget only reads a handful
// of message-slice selectors and they're all plain field reads.
let conversations: { id: string; unread: number; last_message_at: string }[] = [];
vi.mock("@store/hooks", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({
      messages: {
        conversations,
        conversationsStatus: "succeeded",
        threads: {},
        threadStatus: {},
      },
    }),
}));

beforeEach(() => {
  conversations = [];
  mockUseAuth.mockReturnValue(authValue);
  // jsdom has no matchMedia; the widget reads it for its mobile breakpoint
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  // the widget defers to the boot splash — pretend it's already gone
  (window as unknown as { __heroSplashDone?: boolean }).__heroSplashDone = true;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const launcher = () => screen.queryByRole("button", { name: /^Messages/ });

describe("ChatWidget — launcher visibility", () => {
  it("does not render at all when the user has no conversations", () => {
    render(<ChatWidget />);
    expect(launcher()).toBeNull();
  });

  it("renders the launcher once there is a conversation to return to", () => {
    conversations = [{ id: "c1", unread: 0, last_message_at: new Date().toISOString() }];
    render(<ChatWidget />);
    expect(launcher()).toBeInTheDocument();
  });

  it("announces the unread count on the launcher label", () => {
    conversations = [{ id: "c1", unread: 3, last_message_at: new Date().toISOString() }];
    render(<ChatWidget />);
    expect(screen.getByRole("button", { name: "Messages, 3 unread" })).toBeInTheDocument();
  });

  it("still shows for a demo account (the scripted thread is the feature tour)", () => {
    mockUseAuth.mockReturnValue({ ...authValue, isDemo: true });
    render(<ChatWidget />);
    expect(launcher()).toBeInTheDocument();
  });

  it("stays hidden until the boot splash has resolved", () => {
    conversations = [{ id: "c1", unread: 1, last_message_at: new Date().toISOString() }];
    (window as unknown as { __heroSplashDone?: boolean }).__heroSplashDone = false;
    render(<ChatWidget />);
    expect(launcher()).toBeNull();
  });
});
