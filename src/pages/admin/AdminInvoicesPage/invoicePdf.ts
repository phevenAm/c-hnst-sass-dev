import type { Invoice, InvoiceLine } from "./AdminInvoicesPage";
import { fmtDate, hexToRgb, invoiceBandBrand, lineTotalPence, money } from "./invoiceMath";

export type InvoicePracticeDetails = {
  businessName: string | null;
  /** Extra "From" lines under the business name. Optional and plaintext —
   *  the practice's email/phone/address in `practice_settings` are encrypted
   *  PII, so a caller must decrypt before passing them here. */
  fromLines?: (string | null | undefined)[];
  bankName: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  bankReference: string | null;
  /** Optional brand accent (Settings → Invoicing) — a hairline under the masthead. */
  accentHex?: string | null;
  /** Settings → Invoicing "email footer line" — also printed on the PDF. */
  footerText?: string | null;
};

const L = 20; // left text margin (matches the brand kit's running band + table)
const R = 190; // right text margin

// jsPDF + autotable are ~150 kB gzipped — loaded on demand only when someone
// actually downloads or emails an invoice, matching the CPD / expenses pattern.
async function renderInvoiceDoc(
  invoice: Invoice,
  lines: InvoiceLine[],
  clientName: string,
  practice: InvoicePracticeDetails,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { runningHeader, stampChrome, tableBlock, TEAL, INK, MUTED, WASH } = await import(
    "../../../Helpers/pdfBranding"
  );
  const doc = new jsPDF();

  // No photo cover for invoices — a transactional client-facing doc gets a
  // compact branded masthead instead, so it stays a single page. The top band
  // carries the practice's business name (not "Clarity") + the invoice ref.
  const brand = invoiceBandBrand(practice.businessName);
  const accent = hexToRgb(practice.accentHex);
  const paid = invoice.status === "paid";
  runningHeader(doc, `Invoice ${invoice.reference}`, brand);

  // ── Masthead: "From" (left) + invoice meta (right) ──────────────────────────
  let fy = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(brand, L, fy);
  fy += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  for (const raw of practice.fromLines ?? []) {
    const line = raw?.trim();
    if (!line) continue;
    doc.text(line, L, fy);
    fy += 4.6;
  }

  let my = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("INVOICE", R, my, { align: "right" });
  my += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const meta = [`No.  ${invoice.reference}`, `Issued  ${fmtDate(invoice.issue_date)}`];
  if (invoice.due_date) meta.push(`Due  ${fmtDate(invoice.due_date)}`);
  for (const m of meta) {
    doc.text(m, R, my, { align: "right" });
    my += 5.5;
  }

  // Divider under the masthead — the brand accent if one is set, else a hairline.
  let y = Math.max(fy, my) + 4;
  doc.setDrawColor(...(accent ?? WASH));
  doc.setLineWidth(accent ? 0.6 : 0.4);
  doc.line(L, y, R, y);
  doc.setLineWidth(0.2);

  // ── Bill to ────────────────────────────────────────────────────────────────
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("BILL TO", L, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(clientName, L, y);

  // ── Line items ─────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 10,
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: lines.map((l) => [
      l.description || "—",
      String(l.quantity),
      money(l.unit_amount_pence),
      money(lineTotalPence(l)),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    ...tableBlock(),
  });

  // ── Amount due / paid box ──────────────────────────────────────────────────
  const ty = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const boxW = 78;
  doc.setFillColor(...WASH);
  doc.roundedRect(R - boxW, ty, boxW, 13, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(paid ? "AMOUNT PAID" : "AMOUNT DUE", R - boxW + 5, ty + 8);
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(money(invoice.total_pence), R - 5, ty + 8.5, { align: "right" });
  let y2 = ty + 13;
  if (paid && invoice.paid_at) {
    y2 += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEAL);
    doc.text(`Paid ${fmtDate(invoice.paid_at)}`, R, y2, { align: "right" });
  }

  const section = (label: string, atY: number): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text(label, L, atY);
    doc.setDrawColor(...WASH);
    doc.setLineWidth(0.4);
    doc.line(L, atY + 2, R, atY + 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    return atY + 8;
  };

  // ── How to pay (skipped once paid) ─────────────────────────────────────────
  let py = Math.max(y2, ty + 13) + (paid ? 6 : 12);
  if (!paid) {
    py = section("How to pay", py);
    const rows: string[] = [];
    if (practice.bankAccountName) rows.push(`Account name: ${practice.bankAccountName}`);
    if (practice.bankName) rows.push(`Bank: ${practice.bankName}`);
    if (practice.bankSortCode) rows.push(`Sort code: ${practice.bankSortCode}`);
    if (practice.bankAccountNumber) rows.push(`Account number: ${practice.bankAccountNumber}`);
    rows.push(`Payment reference: ${practice.bankReference || invoice.reference}`);
    for (const r of rows) {
      doc.text(r, L, py);
      py += 5;
    }
    py += 2;
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...MUTED);
    doc.text("Please quote the payment reference so your payment can be matched to this invoice.", L, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    py += 4;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (invoice.notes?.trim()) {
    py = section("Notes", py + 10);
    for (const wl of doc.splitTextToSize(invoice.notes.trim(), R - L) as string[]) {
      doc.text(wl, L, py);
      py += 5;
    }
  }

  // ── Practice's own footer line (Settings → Invoicing) ──────────────────────
  if (practice.footerText?.trim()) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(practice.footerText.trim(), R - L) as string[], W / 2, H - 18, { align: "center" });
    doc.setTextColor(...INK);
  }

  stampChrome(doc, { title: `Invoice ${invoice.reference}`, hasCover: false, brand, footerBrand: true });
  return doc;
}

/** Downloads the invoice as a PDF in the browser. */
export async function generateInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  clientName: string,
  practice: InvoicePracticeDetails,
): Promise<void> {
  const doc = await renderInvoiceDoc(invoice, lines, clientName, practice);
  doc.save(`${invoice.reference}.pdf`);
}

/** Same PDF, as base64 (no data: prefix) for emailing as an attachment. */
export async function invoicePdfBase64(
  invoice: Invoice,
  lines: InvoiceLine[],
  clientName: string,
  practice: InvoicePracticeDetails,
): Promise<{ filename: string; base64: string }> {
  const doc = await renderInvoiceDoc(invoice, lines, clientName, practice);
  return { filename: `${invoice.reference}.pdf`, base64: doc.output("datauristring").split(",")[1] };
}

/** A fixed dummy invoice so Settings can preview the look without real data. */
function sampleInvoice(notes: string | null): { invoice: Invoice; lines: InvoiceLine[] } {
  const today = new Date().toISOString().split("T")[0];
  const due = new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0];
  const invoice = {
    id: "sample",
    admin_id: "sample",
    client_id: "sample",
    stub_id: null,
    number: 128,
    reference: "INV-0128",
    status: "sent",
    issue_date: today,
    due_date: due,
    notes,
    total_pence: 13500,
    sent_at: null,
    paid_at: null,
    created_at: today,
    invoice_line_items: [],
  } as unknown as Invoice;
  const lines: InvoiceLine[] = [
    {
      id: "s1",
      invoice_id: "sample",
      description: "Counselling session — 50 minutes",
      quantity: 2,
      unit_amount_pence: 6000,
      session_id: null,
      sort_order: 0,
    },
    {
      id: "s2",
      invoice_id: "sample",
      description: "Written summary for GP",
      quantity: 1,
      unit_amount_pence: 1500,
      session_id: null,
      sort_order: 1,
    },
  ];
  return { invoice, lines };
}

/** Opens a sample invoice PDF in a new tab — the "Preview" button in
 *  Settings → Invoicing. `notes` / `practice.accentHex` come from the
 *  unsaved form so the preview tracks what's on screen. */
export async function previewInvoicePdf(practice: InvoicePracticeDetails, notes: string | null): Promise<void> {
  const { invoice, lines } = sampleInvoice(notes);
  const doc = await renderInvoiceDoc(invoice, lines, "Sample Client", practice);
  doc.output("dataurlnewwindow");
}
