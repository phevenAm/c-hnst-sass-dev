import { describe, expect, it } from "vitest";

import type { Response } from "../models/globalTypes";
import {
  ageFromDob,
  clientDisplayName,
  getInitials,
  getResponseDate,
  isAdultFromDob,
  isPdfUrl,
  isQuestionnaireCheckInDue,
  maskedProfileValue,
  pickColor,
  timeAgo,
} from "./Helpers";

describe("isQuestionnaireCheckInDue", () => {
  it("returns true when 1 day has passed", () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    expect(isQuestionnaireCheckInDue(date.toISOString(), "daily")).toBe(true);
  });

  it("returns true if it's been more than one 1", () => {
    const date = new Date();
    date.setDate(date.getDate() - 5);
    expect(isQuestionnaireCheckInDue(date.toISOString(), "daily")).toBe(true);
  });

  it("returns false if it's been leess than one 1 day", () => {
    const date = new Date();
    expect(isQuestionnaireCheckInDue(date.toISOString(), "daily")).toBe(false);
  });

  it("returns true on 7th day", () => {
    const date = new Date();
    date.setDate(date.getDate() - 7);

    expect(isQuestionnaireCheckInDue(date.toISOString(), "weekly")).toBe(true);
  });

  it("returns true after 7 days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 8);

    expect(isQuestionnaireCheckInDue(date.toISOString(), "weekly")).toBe(true);
  });

  it("returns true on 14th day", () => {
    const date = new Date();
    date.setDate(date.getDate() - 14);

    expect(isQuestionnaireCheckInDue(date.toISOString(), "fortnightly")).toBe(true);
  });

  it("returns true after 14 days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 15);

    expect(isQuestionnaireCheckInDue(date.toISOString(), "fortnightly")).toBe(true);
  });
});

//!function for reference
// export const getInitials = (displayName: string | null, firstName = "", lastName = ""): string => {
//   const name = displayName?.trim() || `${firstName} ${lastName}`.trim();
//   const parts = name.split(" ").filter(Boolean);
//   const first = parts[0]?.[0] ?? "";
//   const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
//   return (first + last).toUpperCase();
// };

describe("ageFromDob", () => {
  it("returns null for missing or unparseable input", () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob(undefined)).toBeNull();
    expect(ageFromDob("")).toBeNull();
    expect(ageFromDob("not-a-date")).toBeNull();
  });

  it("computes a birthday-adjusted age", () => {
    const d = new Date();
    const hadBirthday = `${d.getFullYear() - 30}-01-01`;
    const notYet = `${d.getFullYear() - 30}-12-31`;
    expect(ageFromDob(hadBirthday)).toBe(d.getMonth() === 0 && d.getDate() === 1 ? 30 : 30);
    // Someone whose birthday is 31 Dec is still 29 for most of the year.
    expect(ageFromDob(notYet)).toBe(d.getMonth() === 11 && d.getDate() === 31 ? 30 : 29);
  });

  it("isAdultFromDob agrees with the 18 boundary", () => {
    const y = new Date().getFullYear();
    expect(isAdultFromDob(`${y - 20}-06-15`)).toBe(true);
    expect(isAdultFromDob(`${y - 10}-06-15`)).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-03-10T12:00:00.000Z");
  it("returns empty string for missing / unparseable input", () => {
    expect(timeAgo(null, now)).toBe("");
    expect(timeAgo(undefined, now)).toBe("");
    expect(timeAgo("nonsense", now)).toBe("");
  });
  it("buckets recent times", () => {
    expect(timeAgo("2026-03-10T11:59:40.000Z", now)).toBe("just now");
    expect(timeAgo("2026-03-10T11:30:00.000Z", now)).toBe("30 minutes ago");
    expect(timeAgo("2026-03-10T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-03-09T12:00:00.000Z", now)).toBe("1 day ago");
    expect(timeAgo("2026-03-05T12:00:00.000Z", now)).toBe("5 days ago");
  });
  it("falls back to an absolute date past ~30 days", () => {
    expect(timeAgo("2026-01-01T12:00:00.000Z", now)).toMatch(/2026/);
  });
});

describe("getInitials", () => {
  it("returns initials from a display name with two words", () => {
    expect(getInitials("Stephen Missah", "", "")).toBe("SM");
  });

  it("returns a single initial when the display name has only one word", () => {
    expect(getInitials("Stephen", "", "")).toBe("S");
  });

  it("falls back to first and last name when displayName is null", () => {
    expect(getInitials(null, "Stephen", "Missah")).toBe("SM");
  });

  it("returns an empty string when everything is empty", () => {
    expect(getInitials(null, "", "")).toBe("");
  });
});

describe("clientDisplayName", () => {
  const base = { first_name: "Ada", last_name: "Lovelace", display_name: null, admin_codename: null };

  it("uses the full name by default", () => {
    expect(clientDisplayName(base)).toBe("Ada Lovelace");
  });

  it("prefers display_name over first/last when present", () => {
    expect(clientDisplayName({ ...base, display_name: "Ada L." })).toBe("Ada L.");
  });

  it("uses the codename when useCodenames is on and one exists", () => {
    expect(clientDisplayName({ ...base, admin_codename: "Client 3F9A" }, true)).toBe("Client 3F9A");
  });

  it("still shows the real name when useCodenames is on but there is no codename", () => {
    expect(clientDisplayName(base, true)).toBe("Ada Lovelace");
  });

  it("falls back to the codename when an anonymised client has no name fields, even with useCodenames off", () => {
    expect(
      clientDisplayName({ first_name: "", last_name: "", display_name: null, admin_codename: "Client 7C21" }),
    ).toBe("Client 7C21");
  });

  it("falls back to the generic label only when there is neither a name nor a codename", () => {
    expect(clientDisplayName({ first_name: "", last_name: "", display_name: null, admin_codename: null })).toBe(
      "Unnamed client",
    );
  });
});

describe("getResponseDate", () => {
  it("prefers submitted_at when present", () => {
    const r = { submitted_at: "2026-05-01T09:00:00Z", created_at: "2026-04-01T09:00:00Z" } as Response;
    expect(getResponseDate(r)).toBe("2026-05-01T09:00:00Z");
  });

  it("falls back to created_at when submitted_at is missing", () => {
    const r = { submitted_at: null, created_at: "2026-04-01T09:00:00Z" } as unknown as Response;
    expect(getResponseDate(r)).toBe("2026-04-01T09:00:00Z");
  });

  it("returns an empty string when neither is set", () => {
    const r = { submitted_at: null, created_at: null } as unknown as Response;
    expect(getResponseDate(r)).toBe("");
  });
});

describe("pickColor", () => {
  it("returns one of the known avatar colours", () => {
    expect(["teal", "sage", "stone", "sky", "clay"]).toContain(pickColor("abc123"));
  });

  it("is deterministic for the same id", () => {
    expect(pickColor("user-42")).toBe(pickColor("user-42"));
  });

  it("keys only off the first character", () => {
    expect(pickColor("Axxxxx")).toBe(pickColor("Ayyyyy"));
  });
});

describe("isPdfUrl", () => {
  it("is true for a .pdf path regardless of case or query string", () => {
    expect(isPdfUrl("https://example.com/docs/agreement.pdf")).toBe(true);
    expect(isPdfUrl("https://example.com/docs/AGREEMENT.PDF")).toBe(true);
    expect(isPdfUrl("https://example.com/docs/agreement.pdf?token=abc")).toBe(true);
  });

  it("is false for non-pdf resources", () => {
    expect(isPdfUrl("https://example.com/docs/agreement.docx")).toBe(false);
    expect(isPdfUrl("https://example.com/pdf-guide/")).toBe(false);
  });

  it("is false for a string that is not a URL", () => {
    expect(isPdfUrl("not a url.pdf")).toBe(false);
    expect(isPdfUrl("")).toBe(false);
  });
});

describe("maskedProfileValue", () => {
  it("returns the stringified value when shown and not masked", () => {
    expect(maskedProfileValue(42, { show: true })).toBe("42");
    expect(maskedProfileValue("jane@example.com", { show: true })).toBe("jane@example.com");
  });

  it("returns null when the field is not shown for this client", () => {
    expect(maskedProfileValue("jane@example.com", { show: false })).toBeNull();
    expect(maskedProfileValue("jane@example.com", { show: null })).toBeNull();
  });

  it("returns null when the practice-wide master switch hides everything", () => {
    expect(maskedProfileValue("jane@example.com", { show: true, masterHidden: true })).toBeNull();
  });

  it("returns null for empty or nullish values", () => {
    expect(maskedProfileValue(null, { show: true })).toBeNull();
    expect(maskedProfileValue(undefined, { show: true })).toBeNull();
    expect(maskedProfileValue("", { show: true })).toBeNull();
  });

  it("masks with *** when codenames are on", () => {
    expect(maskedProfileValue("jane@example.com", { show: true, codenames: true })).toBe("***");
  });
});
