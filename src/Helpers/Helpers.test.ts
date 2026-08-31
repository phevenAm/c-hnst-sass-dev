import { describe, expect, it } from "vitest";

import { clientDisplayName, getInitials, isQuestionnaireCheckInDue } from "./Helpers";

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
