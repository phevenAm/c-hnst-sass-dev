// ── Branded CSV export ───────────────────────────────────────────────────────
// Every CSV a user downloads opens with a short comment block:
//   # Clarity — <title>
//   # <label>: <value>        (one line per meta pair)
//   # Generated: <date>
//   <blank>
//   <header row>
//   <data…>
//
// The metadata lines are prefixed with "#" so parsers that support a comment
// character (pandas `read_csv(comment="#")`, csvkit, R) skip them automatically;
// spreadsheet apps (Excel, Sheets, Numbers) just show them as three text rows
// above the table. A UTF-8 BOM is prepended so Excel reads accents correctly.
//
// Data cells are only quoted when they actually need it (comma, quote, newline
// or edge whitespace) so numbers stay numeric in a spreadsheet.

const needsQuoting = (s: string): boolean => /[",\r\n]/.test(s) || s !== s.trim();

const cell = (v: unknown): string => {
  const s = String(v ?? "");
  return needsQuoting(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const row = (cells: unknown[]): string => cells.map(cell).join(",");

export type BrandedCsvOptions = {
  /** File name without extension, e.g. "expenses-2026". */
  filename: string;
  /** Document kind, e.g. "Expenses export". */
  title: string;
  /** Column header row. */
  headers: string[];
  /** Data rows, already stringify-able. */
  rows: unknown[][];
  /** Extra preamble pairs, e.g. [["Practice", "Oakwood Therapy"], ["Year", 2026]]. */
  meta?: [string, unknown][];
};

/** Builds the file body (exported for tests; no DOM). */
export function buildBrandedCsv({ title, headers, rows, meta = [] }: Omit<BrandedCsvOptions, "filename">): string {
  const generated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const lines = [
    `# Clarity — ${title}`,
    ...meta.map(([k, v]) => `# ${k}: ${String(v ?? "")}`),
    `# Generated: ${generated}`,
    "",
    row(headers),
    ...rows.map(row),
  ];

  // Leading U+FEFF BOM so Excel opens it as UTF-8.
  return `﻿${lines.join("\r\n")}`;
}

export function downloadBrandedCsv(opts: BrandedCsvOptions): void {
  const blob = new Blob([buildBrandedCsv(opts)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
