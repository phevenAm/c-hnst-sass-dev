import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SubscribePage from "./SubscribePage";

// An already-subscribed admin landing on /subscribe directly (stale
// bookmark, back button after checkout, retyping the URL) used to just see
// the pay page again — SubscriptionGate only stops them being *forced* here
// when the subscription lapses, it never guarded a direct visit. These tests
// cover the redirect added for that: active/trialing -> away, unless the
// visit is the post-checkout ?subscribed=true one still being verified by
// SubscriptionGate (which owns that race, not this page).

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockNavigateProps = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [searchParamsValue],
  Navigate: (props: { to: string; replace?: boolean }) => {
    mockNavigateProps(props);
    return null;
  },
}));

vi.mock("@context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/Helpers/referral", () => ({ captureReferralCode: vi.fn(), getReferralCode: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

let authState: {
  practiceSettings: { subscription_status: string | null; onboarding_required: boolean } | null;
  loading: boolean;
} = { practiceSettings: null, loading: true };
vi.mock("@context/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn(), ...authState }),
}));

// Not an agency member in any of these cases — agencySlice's own selectors
// run for real against this fake state, same shape their real reducer uses.
// theme is also needed: LeafLogoMark (rendered whenever the page gets past
// the Navigate checks) reads it via useResolvedTheme.
vi.mock("@/store/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ agency: { bootstrapStatus: "succeeded", membership: null }, theme: { mode: "light" } }),
}));

function setup(params: string, auth: typeof authState) {
  searchParamsValue = new URLSearchParams(params);
  authState = auth;
  return render(<SubscribePage />);
}

describe("SubscribePage — already-subscribed redirect", () => {
  it("redirects an active, onboarded admin to /admin", () => {
    setup("", {
      practiceSettings: { subscription_status: "active", onboarding_required: false },
      loading: false,
    });
    expect(mockNavigateProps).toHaveBeenCalledWith({ to: "/admin", replace: true });
  });

  it("redirects an active admin who hasn't onboarded yet to /admin/setup", () => {
    setup("", {
      practiceSettings: { subscription_status: "active", onboarding_required: true },
      loading: false,
    });
    expect(mockNavigateProps).toHaveBeenCalledWith({ to: "/admin/setup", replace: true });
  });

  it("redirects a trialing admin the same way", () => {
    setup("", {
      practiceSettings: { subscription_status: "trialing", onboarding_required: false },
      loading: false,
    });
    expect(mockNavigateProps).toHaveBeenCalledWith({ to: "/admin", replace: true });
  });

  it("does NOT redirect while auth is still loading", () => {
    setup("", {
      practiceSettings: { subscription_status: "active", onboarding_required: false },
      loading: true,
    });
    expect(mockNavigateProps).not.toHaveBeenCalled();
  });

  it("does NOT redirect a never-subscribed admin — they should see the pay page", () => {
    setup("", { practiceSettings: { subscription_status: null, onboarding_required: true }, loading: false });
    expect(mockNavigateProps).not.toHaveBeenCalled();
  });

  it("does NOT redirect on the post-checkout ?subscribed=true visit — SubscriptionGate owns that race", () => {
    setup("subscribed=true", {
      practiceSettings: { subscription_status: "active", onboarding_required: true },
      loading: false,
    });
    expect(mockNavigateProps).not.toHaveBeenCalled();
  });
});
