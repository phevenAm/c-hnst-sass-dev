import type { Invoice, InvoiceLine } from "./AdminInvoicesPage";
import { hexToRgb, invoiceBandBrand, lineTotalPence, money } from "./invoiceMath";

export type InvoicePracticeDetails = {
  businessName: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  bankReference: string | null;
  /** Optional brand accent (Settings → Invoicing) for the masthead rule. */
  accentHex?: string | null;
};

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
  const { runningHeader, stampChrome, tableBlock } = await import("../../../Helpers/pdfBranding");
  const doc = new jsPDF();

  // No photo cover for invoices — a transactional client-facing doc gets a
  // compact branded masthead instead, so it stays a single page. The top band
  // carries the practice's business name (not "Clarity") + the invoice ref.
  const brand = invoiceBandBrand(practice.businessName);
  let headerY = runningHeader(doc, `Invoice ${invoice.reference}`, brand);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Invoice", 14, headerY + 6);

  // Optional brand accent rule under the masthead.
  const accent = hexToRgb(practice.accentHex);
  if (accent) {
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.8);
    doc.line(14, headerY + 9, 196, headerY + 9);
    doc.setLineWidth(0.2);
  }

  headerY += 16;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice number: ${invoice.reference}`, 14, headerY);
  doc.text(`Issue date: ${invoice.issue_date}`, 14, headerY + 6);
  headerY += 12;
  if (invoice.due_date) {
    doc.text(`Due date: ${invoice.due_date}`, 14, headerY);
    headerY += 6;
  }
  doc.text(`Billed to: ${clientName}`, 14, headerY);

  autoTable(doc, {
    startY: headerY + 8,
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: lines.map((l) => [
      l.description || "—",
      String(l.quantity),
      money(l.unit_amount_pence),
      money(lineTotalPence(l)),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    ...tableBlock(),
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${money(invoice.total_pence)}`, 196, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  const hasBank = practice.bankAccountNumber || practice.bankSortCode || practice.bankName || practice.bankAccountName;
  if (hasBank) {
    y += 14;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("How to pay", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 6;
    const rows: string[] = [];
    if (practice.bankAccountName) rows.push(`Account name: ${practice.bankAccountName}`);
    if (practice.bankName) rows.push(`Bank: ${practice.bankName}`);
    if (practice.bankSortCode) rows.push(`Sort code: ${practice.bankSortCode}`);
    if (practice.bankAccountNumber) rows.push(`Account number: ${practice.bankAccountNumber}`);
    rows.push(`Payment reference: ${practice.bankReference || invoice.reference}`);
    for (const r of rows) {
      doc.text(r, 14, y);
      y += 5;
    }
    y += 2;
    doc.setFont("helvetica", "italic");
    doc.text("Please quote the payment reference above so your payment can be matched to this invoice.", 14, y);
    doc.setFont("helvetica", "normal");
  } else {
    // No bank details on file — still tell the client what reference to quote.
    y += 14;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("How to pay", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 6;
    doc.text(`Payment reference: ${practice.bankReference || invoice.reference}`, 14, y);
    y += 7;
    doc.setFont("helvetica", "italic");
    doc.text("Please quote this reference with your payment so it can be matched to this invoice.", 14, y);
    doc.setFont("helvetica", "normal");
  }

  if (invoice.notes?.trim()) {
    y += 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 6;
    const wrapped = doc.splitTextToSize(invoice.notes, 180);
    doc.text(wrapped, 14, y);
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
  const invoice = {
    id: "sample",
    admin_id: "sample",
    client_id: "sample",
    stub_id: null,
    number: 128,
    reference: "INV-0128",
    status: "sent",
    issue_date: today,
    due_date: today,
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
