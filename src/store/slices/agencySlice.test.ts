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
