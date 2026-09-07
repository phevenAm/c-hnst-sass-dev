// ── Activity-log exports (CSV + PDF) ────────────────────────────────────────
// Shared by the admin Activity page (/admin/audit-logs) and the agency Activity
// page (/agency/activity). Each page reduces its own rows to ActivityExportRow[]
// then calls these.
//
// CSV goes through the branded helper (comment preamble + BOM). PDF lazy-loads
// jsPDF + autotable (~150 kB gz) and uses the shared Clarity brand kit, matching
// the invoice / CPD / expenses exports.

import { downloadBrandedCsv } from "./csvExport";

export type ActivityExportRow = {
  /** Already-formatted timestamp, e.g. "9:30am, Mon 1st Sep 2026". */
  when: string;
  /** Who acted. */
  who: string;
  /** One-line description of what happened. */
  summary: string;
  /** Field-level changes, pre-joined, e.g. "status: scheduled → cancelled". */
  details: string;
};

const HEADERS = ["When", "Who", "Activity", "Details"];
const body = (rows: ActivityExportRow[]) => rows.map((r) => [r.when, r.who, r.summary, r.details]);

type CsvOpts = { filename: string; title: string; meta?: [string, unknown][] };

export function exportActivityCsv(rows: ActivityExportRow[], opts: CsvOpts): void {
  downloadBrandedCsv({
    filename: opts.filename,
    title: opts.title,
    headers: HEADERS,
    rows: body(rows),
    meta: opts.meta,
  });
}

type PdfOpts = { filename: string; title: string; subtitle?: string; meta?: string[] };

export async function exportActivityPdf(rows: ActivityExportRow[], opts: PdfOpts): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { addCoverPage, stampChrome, tableBlock } = await import("./pdfBranding");

  const doc = new jsPDF({ orientation: "landscape" });
  addCoverPage(doc, {
    title: opts.title,
    subtitle: opts.subtitle,
    meta: opts.meta ?? [`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`],
  });
  doc.addPage();
  autoTable(doc, {
    startY: 24,
    head: [HEADERS],
    body: body(rows),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 42 },
      3: { cellWidth: 95 },
    },
    ...tableBlock(),
  });
  stampChrome(doc, { title: opts.title });
  doc.save(`${opts.filename}.pdf`);
}
