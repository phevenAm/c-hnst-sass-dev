import { afterEach, describe, expect, it, vi } from "vitest";

// `initialState` is built at module-load time from the agency feature flag, so
// each case has to stub the env var and re-import the module fresh.
async function loadReducer() {
  vi.resetModules();
  return (await import("./agencySlice")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("agencySlice initial bootstrapStatus", () => {
  it("starts 'succeeded' (no membership) when the agency flag is explicitly disabled", async () => {
    // The agency flag is default-ON now — only an explicit "false" / "0" turns
    // it off, so an empty value would leave it enabled.
    vi.stubEnv("VITE_FF_AGENCY", "false");
    const reducer = await loadReducer();

    const state = reducer(undefined, { type: "@@INIT" });

    expect(state.bootstrapStatus).toBe("succeeded");
    expect(state.membership).toBeNull();
  });

  it("starts 'idle' (awaiting bootstrap) when the agency flag is on", async () => {
    vi.stubEnv("VITE_FF_AGENCY", "true");
    const reducer = await loadReducer();

    const state = reducer(undefined, { type: "@@INIT" });

    expect(state.bootstrapStatus).toBe("idle");
  });
});

describe("agencySlice setAgencyMember.fulfilled", () => {
  it("applies role, counselling_enabled, status, and color to the matching member", async () => {
    vi.stubEnv("VITE_FF_AGENCY", "true");
    const reducer = await loadReducer();

    const member = {
      id: "m-1",
      agency_id: "agency-1",
      user_id: "staff-1",
      role: "counsellor" as const,
      employment_type: "employee" as const,
      counselling_enabled: true,
      status: "active" as const,
      invited_at: null,
      joined_at: "2026-01-01T00:00:00Z",
      agreement_accepted_at: null,
      agreement_accepted_version: null,
      agreement_signed_name: null,
      color: null,
      first_name: "Sam",
      last_name: "Staff",
      display_name: null,
      email: null,
      avatar_url: null,
    };
    const seeded = { ...reducer(undefined, { type: "@@INIT" }), members: [member] };

    // Regression: the reducer used to copy role/counselling_enabled/status onto
    // the in-memory member but silently dropped color, so ConfigureMemberModal's
    // colour swatch save persisted to the DB fine but never showed up in the UI
    // until a full refetch — see AgencyMemberDetailPage's owner-configure fix.
    const next = reducer(seeded, {
      type: "agency/setMember/fulfilled",
      payload: {
        member_user_id: "staff-1",
        role: "manager" as const,
        counselling_enabled: false,
        status: "active" as const,
        color: "#8f3f3f",
      },
    });

    const updated = next.members.find((m) => m.user_id === "staff-1");
    expect(updated?.role).toBe("manager");
    expect(updated?.counselling_enabled).toBe(false);
    expect(updated?.color).toBe("#8f3f3f");
  });

  it("leaves color untouched when the payload doesn't include one", async () => {
    vi.stubEnv("VITE_FF_AGENCY", "true");
    const reducer = await loadReducer();

    const member = {
      id: "m-1",
      agency_id: "agency-1",
      user_id: "staff-1",
      role: "counsellor" as const,
      employment_type: "employee" as const,
      counselling_enabled: true,
      status: "active" as const,
      invited_at: null,
      joined_at: "2026-01-01T00:00:00Z",
      agreement_accepted_at: null,
      agreement_accepted_version: null,
      agreement_signed_name: null,
      color: "#2d7264",
      first_name: "Sam",
      last_name: "Staff",
      display_name: null,
      email: null,
      avatar_url: null,
    };
    const seeded = { ...reducer(undefined, { type: "@@INIT" }), members: [member] };

    const next = reducer(seeded, {
      type: "agency/setMember/fulfilled",
      payload: { member_user_id: "staff-1", status: "disabled" as const },
    });

    const updated = next.members.find((m) => m.user_id === "staff-1");
    expect(updated?.status).toBe("disabled");
    expect(updated?.color).toBe("#2d7264");
  });
});

describe("agencySlice expenses/onboarding status (2026-09-16 — pages had no way to tell loading from empty)", () => {
  it("tracks expensesStatus through the fetchAgencyExpenses lifecycle", async () => {
    const reducer = await loadReducer();
    const initial = reducer(undefined, { type: "@@INIT" });
    expect(initial.expensesStatus).toBe("idle");

    const loading = reducer(initial, { type: "agency/fetchExpenses/pending" });
    expect(loading.expensesStatus).toBe("loading");

    const succeeded = reducer(loading, { type: "agency/fetchExpenses/fulfilled", payload: [] });
    expect(succeeded.expensesStatus).toBe("succeeded");
    expect(succeeded.expenses).toEqual([]);

    const failed = reducer(loading, { type: "agency/fetchExpenses/rejected", payload: "boom" });
    expect(failed.expensesStatus).toBe("failed");
  });

  it("tracks onboardingStatus through the fetchOnboardingItems lifecycle", async () => {
    const reducer = await loadReducer();
    const initial = reducer(undefined, { type: "@@INIT" });
    expect(initial.onboardingStatus).toBe("idle");

    const loading = reducer(initial, { type: "agency/fetchOnboarding/pending" });
    expect(loading.onboardingStatus).toBe("loading");

    const succeeded = reducer(loading, { type: "agency/fetchOnboarding/fulfilled", payload: [] });
    expect(succeeded.onboardingStatus).toBe("succeeded");
    expect(succeeded.onboardingItems).toEqual([]);

    const failed = reducer(loading, { type: "agency/fetchOnboarding/rejected", payload: "boom" });
    expect(failed.onboardingStatus).toBe("failed");
  });
});
