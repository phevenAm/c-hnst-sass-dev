import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byMonth, ledgerRowKind, ledgerRowName, money, periodStart, personName, taxYearStart } from "./financeOverview";

afterEach(() => {
  vi.useRealTimers();
});

describe("money", () => {
  it("formats integer pence as pounds", () => {
    expect(money(0)).toBe("£0.00");
    expect(money(1)).toBe("£0.01");
    expect(money(12_500)).toBe("£125.00");
    expect(money(-6000)).toBe("£-60.00");
  });
});

describe("taxYearStart (UK, 6 April boundary)", () => {
  it("6 April onward → this calendar year", () => {
    expect(taxYearStart(dayjs("2026-04-06")).format("YYYY-MM-DD")).toBe("2026-04-06");
    expect(taxYearStart(dayjs("2026-12-31")).format("YYYY-MM-DD")).toBe("2026-04-06");
  });

  it("before 6 April → previous calendar year", () => {
    expect(taxYearStart(dayjs("2026-04-05")).format("YYYY-MM-DD")).toBe("2025-04-06");
    expect(taxYearStart(dayjs("2026-01-01")).format("YYYY-MM-DD")).toBe("2025-04-06");
    expect(taxYearStart(dayjs("2026-03-31")).format("YYYY-MM-DD")).toBe("2025-04-06");
  });
});

describe("periodStart", () => {
  it("'all' has no cut-off", () => {
    expect(periodStart("all")).toBeNull();
  });

  it("'30d' is 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    expect(periodStart("30d")?.format("YYYY-MM-DD")).toBe("2026-08-04");
  });

  it("'year' is the current tax-year start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));
    expect(periodStart("year")?.format("YYYY-MM-DD")).toBe("2026-04-06");
  });
});

describe("byMonth", () => {
  it("returns one bucket per month, oldest first, labelled by short month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    const points = byMonth([], 3);
    expect(points.map((p) => p.label)).toEqual(["Jul", "Aug", "Sep"]);
    expect(points.every((p) => p.value === 0)).toBe(true);
  });

  it("sums pence into the matching month as whole pounds, ignoring out-of-window rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    const points = byMonth(
      [
        { date: "2026-09-01", pence: 6000 },
        { date: "2026-09-20", pence: 4050 }, // 40.50 → contributes, rounds at the end
        { date: "2026-08-10", pence: 3000 },
        { date: "2026-05-01", pence: 9999 }, // older than the 3-month window
      ],
      3,
    );
    expect(points).toEqual([
      { label: "Jul", value: 0 },
      { label: "Aug", value: 30 },
      { label: "Sep", value: 101 }, // (60 + 40.5) rounded
    ]);
  });
});

describe("personName", () => {
  it("prefers display_name, then First Last, then empty", () => {
    expect(personName({ display_name: "Dr Green", first_name: "A", last_name: "B" })).toBe("Dr Green");
    expect(personName({ first_name: "Marcus", last_name: "Webb" })).toBe("Marcus Webb");
    expect(personName({ first_name: "Cher", last_name: null })).toBe("Cher");
    expect(personName({})).toBe("");
    expect(personName(null)).toBe("");
  });

  it("uses the codename when the practice is in codename mode", () => {
    expect(personName({ first_name: "Marcus", last_name: "Webb", admin_codename: "Falcon" }, true)).toBe("Falcon");
    // no codename set → still falls back to the real name
    expect(personName({ first_name: "Marcus", last_name: "Webb" }, true)).toBe("Marcus Webb");
    // codename mode off → real name even if a codename exists
    expect(personName({ first_name: "Marcus", last_name: "Webb", admin_codename: "Falcon" }, false)).toBe(
      "Marcus Webb",
    );
  });
});

describe("ledgerRowName", () => {
  it("falls back display_name → client → stub → empty", () => {
    expect(ledgerRowName({ display_name: "Jo" })).toBe("Jo");
    expect(ledgerRowName({ client_first_name: "Marcus", client_last_name: "Webb" })).toBe("Marcus Webb");
    expect(ledgerRowName({ stub_first_name: "Offline", stub_last_name: "Person" })).toBe("Offline Person");
    expect(ledgerRowName({})).toBe("");
  });

  it("prefers the codename (client or stub) in codename mode", () => {
    expect(ledgerRowName({ display_name: "Jo", admin_codename: "Falcon" }, true)).toBe("Falcon");
    expect(ledgerRowName({ stub_first_name: "Offline", stub_last_name: "Person", stub_codename: "Otter" }, true)).toBe(
      "Otter",
    );
    // codename mode on but none set → real name
    expect(ledgerRowName({ client_first_name: "Marcus", client_last_name: "Webb" }, true)).toBe("Marcus Webb");
  });
});

describe("ledgerRowKind", () => {
  it("maps source to a human label", () => {
    expect(ledgerRowKind("session")).toBe("Session payment");
    expect(ledgerRowKind("stub-session")).toBe("Offline session payment");
    expect(ledgerRowKind("manual")).toBe("Manual payment");
    expect(ledgerRowKind(null)).toBe("Manual payment");
  });
});
