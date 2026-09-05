import type { Invoice, InvoiceLine } from "./AdminInvoicesPage";
import { lineTotalPence, money } from "./invoiceMath";

export type InvoicePracticeDetails = {
  businessName: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  bankReference: string | null;
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
  // compact branded masthead instead, so it stays a single page.
  let headerY = runningHeader(doc, `Invoice ${invoice.reference}`);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Invoice", 14, headerY + 6);
  if (practice.businessName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(practice.businessName, 196, headerY + 6, { align: "right" });
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

  stampChrome(doc, { title: `Invoice ${invoice.reference}`, hasCover: false });
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
