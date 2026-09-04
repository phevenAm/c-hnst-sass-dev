import { describe, expect, it } from "vitest";

import { buildBrandedCsv } from "./csvExport";

describe("buildBrandedCsv", () => {
  const base = {
    title: "Expenses export",
    headers: ["Date", "Category", "Amount"],
    rows: [
      ["2026-01-14", "Supervision", "90.00"],
      ["2026-02-03", "Training, CPD", "240.00"],
    ] as unknown[][],
    meta: [
      ["Practice", "Oakwood Therapy"],
      ["Year", 2026],
    ] as [string, unknown][],
  };

  it("starts with a UTF-8 BOM", () => {
    expect(buildBrandedCsv(base).charCodeAt(0)).toBe(0xfeff);
  });

  it("writes the metadata as # comment lines then a blank line", () => {
    const lines = buildBrandedCsv(base).slice(1).split("\r\n");
    expect(lines[0]).toBe("# Clarity — Expenses export");
    expect(lines[1]).toBe("# Practice: Oakwood Therapy");
    expect(lines[2]).toBe("# Year: 2026");
    expect(lines[3]).toMatch(/^# Generated: \d/);
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("Date,Category,Amount");
  });

  it("only quotes cells that need it — numbers stay bare", () => {
    const lines = buildBrandedCsv(base).split("\r\n");
    expect(lines).toContain("2026-01-14,Supervision,90.00");
    // the comma in "Training, CPD" forces quoting on that cell only
    expect(lines).toContain('2026-02-03,"Training, CPD",240.00');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = buildBrandedCsv({ ...base, meta: [], rows: [['a "quoted" thing', "x", "1"]] });
    expect(csv).toContain('"a ""quoted"" thing",x,1');
  });

  it("uses CRLF line endings", () => {
    expect(buildBrandedCsv({ ...base, meta: [] })).toContain("\r\n");
  });
});
