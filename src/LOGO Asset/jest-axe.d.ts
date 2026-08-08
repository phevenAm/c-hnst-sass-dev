import type { AxeMatchers } from "jest-axe";
import "vitest";

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: must match Vitest's Assertion<R = any> signature to extend it
  interface Assertion<R = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
