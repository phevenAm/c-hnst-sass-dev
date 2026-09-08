import { afterEach, describe, expect, it, vi } from "vitest";

import { isFeatureEnabled } from "./featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isFeatureEnabled", () => {
  it("is off when the env var is unset", () => {
    vi.stubEnv("VITE_FF_AGENCY", undefined as unknown as string);
    expect(isFeatureEnabled("agency")).toBe(false);
  });

  it.each(["true", "1"])("is on when VITE_FF_AGENCY is %j", (value) => {
    vi.stubEnv("VITE_FF_AGENCY", value);
    expect(isFeatureEnabled("agency")).toBe(true);
  });

  // dotenv keeps everything after `=`, so an inline comment ends up in the value.
  it.each([
    "true //! to turn agency feature on",
    "true # on",
    "true   ",
  ])("still on when the .env value has a trailing comment / whitespace: %j", (value) => {
    vi.stubEnv("VITE_FF_AGENCY", value);
    expect(isFeatureEnabled("agency")).toBe(true);
  });

  it.each(["false", "0", "", "yes", "TRUE"])("stays off for the non-truthy value %j", (value) => {
    vi.stubEnv("VITE_FF_AGENCY", value);
    expect(isFeatureEnabled("agency")).toBe(false);
  });
});
