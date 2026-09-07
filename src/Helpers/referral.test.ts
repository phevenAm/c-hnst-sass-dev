import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureReferralCode, getReferralCode } from "./referral";

const STORAGE_KEY = "referral_code";

describe("captureReferralCode / getReferralCode", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it("stores a ?ref= code, normalised to upper case", () => {
    captureReferralCode("?ref=friend20");
    expect(getReferralCode()).toBe("FRIEND20");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("FRIEND20");
  });

  it("accepts a leading '?' or a bare query string", () => {
    captureReferralCode("ref=abc");
    expect(getReferralCode()).toBe("ABC");
  });

  it("trims surrounding whitespace before storing", () => {
    captureReferralCode("?ref=%20spaced%20");
    expect(getReferralCode()).toBe("SPACED");
  });

  it("picks the code out from among other params", () => {
    captureReferralCode("?utm_source=x&ref=xyz&plan=growth");
    expect(getReferralCode()).toBe("XYZ");
  });

  it("does nothing when there is no ref param", () => {
    captureReferralCode("?utm_source=newsletter");
    expect(getReferralCode()).toBeNull();
  });

  it("ignores an empty or whitespace-only ref value", () => {
    captureReferralCode("?ref=");
    expect(getReferralCode()).toBeNull();
    captureReferralCode("?ref=%20%20");
    expect(getReferralCode()).toBeNull();
  });

  it("does not overwrite an existing code when a later navigation has no ref", () => {
    captureReferralCode("?ref=first");
    captureReferralCode("?utm=nope");
    expect(getReferralCode()).toBe("FIRST");
  });

  it("returns null before any code has been captured", () => {
    expect(getReferralCode()).toBeNull();
  });
});
