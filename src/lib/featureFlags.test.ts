import { afterEach, describe, expect, it, vi } from "vitest";

import { isFeatureEnabled } from "./featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isFeatureEnabled", () => {
  // messaging is a default-ON flag: only an explicit "false" / "0" turns it off.
  // The code, routes and migrations are all live and the /messages routes carry
  // their own auth gating.
  describe("messaging (default on)", () => {
    it("is on when the env var is unset", () => {
      vi.stubEnv("VITE_FF_MESSAGING", undefined as unknown as string);
      expect(isFeatureEnabled("messaging")).toBe(true);
    });

    it.each(["", "true", "1", "yes", "anything"])("stays on for the non-falsy value %j", (value) => {
      vi.stubEnv("VITE_FF_MESSAGING", value);
      expect(isFeatureEnabled("messaging")).toBe(true);
    });

    it.each([
      "false",
      "0",
      "false # disabled for this deploy",
      "false   ",
    ])("is off only for an explicit %j", (value) => {
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
