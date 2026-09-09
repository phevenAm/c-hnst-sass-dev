import { afterEach, describe, expect, it, vi } from "vitest";

import { isFeatureEnabled } from "./featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isFeatureEnabled", () => {
  // messaging is a default-OFF flag: anything that isn't explicitly truthy is off.
  describe("messaging (default off)", () => {
    it("is off when the env var is unset", () => {
      vi.stubEnv("VITE_FF_MESSAGING", undefined as unknown as string);
      expect(isFeatureEnabled("messaging")).toBe(false);
    });

    it.each(["true", "1"])("is on when VITE_FF_MESSAGING is %j", (value) => {
      vi.stubEnv("VITE_FF_MESSAGING", value);
      expect(isFeatureEnabled("messaging")).toBe(true);
    });

    // dotenv keeps everything after `=`, so an inline comment ends up in the value.
    it.each([
      "true //! to turn messaging on",
      "true # on",
      "true   ",
    ])("still on when the .env value has a trailing comment / whitespace: %j", (value) => {
      vi.stubEnv("VITE_FF_MESSAGING", value);
      expect(isFeatureEnabled("messaging")).toBe(true);
    });

    it.each(["false", "0", "", "yes", "TRUE"])("stays off for the non-truthy value %j", (value) => {
      vi.stubEnv("VITE_FF_MESSAGING", value);
      expect(isFeatureEnabled("messaging")).toBe(false);
    });
  });

  // agency is a default-ON flag: only an explicit "false" / "0" turns it off,
  // because the /agency routes are already account-gated to agency members.
  describe("agency (default on)", () => {
    it("is on when the env var is unset", () => {
      vi.stubEnv("VITE_FF_AGENCY", undefined as unknown as string);
      expect(isFeatureEnabled("agency")).toBe(true);
    });

    it.each(["", "true", "1", "yes", "anything"])("stays on for the non-falsy value %j", (value) => {
      vi.stubEnv("VITE_FF_AGENCY", value);
      expect(isFeatureEnabled("agency")).toBe(true);
    });

    it.each([
      "false",
      "0",
      "false # disabled for this deploy",
      "false   ",
    ])("is off only for an explicit %j", (value) => {
      vi.stubEnv("VITE_FF_AGENCY", value);
      expect(isFeatureEnabled("agency")).toBe(false);
    });
  });
});
