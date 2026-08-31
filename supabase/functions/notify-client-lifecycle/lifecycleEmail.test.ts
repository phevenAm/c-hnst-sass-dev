import { describe, expect, it } from "vitest";

import { buildLifecycleEmail, isValidEvent, LIFECYCLE_EMAIL_TYPE, lifecycleSkipReason } from "./lifecycleEmail";

describe("isValidEvent", () => {
  it("accepts the three lifecycle events", () => {
    expect(isValidEvent("deactivated")).toBe(true);
    expect(isValidEvent("reactivated")).toBe(true);
    expect(isValidEvent("closed")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidEvent("paused")).toBe(false);
    expect(isValidEvent(undefined)).toBe(false);
    expect(isValidEvent("")).toBe(false);
  });
});

describe("lifecycleSkipReason", () => {
  it("skips when there is no email", () => {
    expect(lifecycleSkipReason({ email: null, event: "deactivated" })).toBe("no reachable email");
    expect(lifecycleSkipReason({ email: "", event: "closed" })).toBe("no reachable email");
  });

  it("skips an anonymised sentinel address (client was anonymised before reactivation)", () => {
    expect(lifecycleSkipReason({ email: "former-client+abc-123@deleted.invalid", event: "reactivated" })).toBe(
      "no reachable email",
    );
  });

  it("skips when the practice has turned this email type off", () => {
    expect(
      lifecycleSkipReason({
        email: "jane@example.com",
        event: "deactivated",
        disabledEmailTypes: ["account_deactivated"],
      }),
    ).toBe("practice disabled this type");
  });

  it("does not skip a normal address for an enabled type", () => {
    expect(
      lifecycleSkipReason({
        email: "jane@example.com",
        event: "deactivated",
        disabledEmailTypes: ["session_reminder"],
      }),
    ).toBeNull();
  });

  it("keys the practice toggle off the correct per-event type", () => {
    // 'account_reactivated' disabled must not suppress a 'deactivated' send
    expect(
      lifecycleSkipReason({
        email: "jane@example.com",
        event: "deactivated",
        disabledEmailTypes: ["account_reactivated"],
      }),
    ).toBeNull();
  });
});

describe("buildLifecycleEmail", () => {
  it("deactivated: no CTA, explains records are retained", () => {
    const c = buildLifecycleEmail({ event: "deactivated", firstName: "Jane" });
    expect(c.subject).toBe("Your account has been deactivated");
    expect(c.title).toContain("Jane");
    expect(c.cta).toBeUndefined();
    expect(c.notes.join(" ")).toMatch(/retained/i);
  });

  it("reactivated: has a Sign in CTA pointing at {appUrl}/login", () => {
    const c = buildLifecycleEmail({ event: "reactivated", firstName: "Jane", appUrl: "https://app.example.com/" });
    expect(c.cta).toEqual({ label: "Sign in", url: "https://app.example.com/login" });
  });

  it("reactivated: omits the CTA when no appUrl is configured", () => {
    const c = buildLifecycleEmail({ event: "reactivated", firstName: "Jane" });
    expect(c.cta).toBeUndefined();
  });

  it("closed: confirms anonymisation and codename-only retention", () => {
    const c = buildLifecycleEmail({ event: "closed", firstName: "Jane" });
    expect(c.subject).toBe("Your account has been closed");
    expect(c.notes.join(" ")).toMatch(/anonymised/i);
    expect(c.notes.join(" ")).toMatch(/codename/i);
  });

  it("falls back to 'there' when the first name is missing or blank", () => {
    expect(buildLifecycleEmail({ event: "closed", firstName: null }).title).toContain("there");
    expect(buildLifecycleEmail({ event: "closed", firstName: "   " }).title).toContain("there");
  });
});

describe("LIFECYCLE_EMAIL_TYPE", () => {
  it("maps each event to the email_logs type the migration whitelists", () => {
    expect(LIFECYCLE_EMAIL_TYPE).toEqual({
      deactivated: "account_deactivated",
      reactivated: "account_reactivated",
      closed: "account_closed",
    });
  });
});
