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
// actually downloads an invoice, matching the CPD / expenses export pattern.
export async function generateInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[],
  clientName: string,
  practice: InvoicePracticeDetails,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text("Invoice", 14, 20);

  doc.setFontSize(10);
  doc.text(practice.businessName ?? "", 196, 16, { align: "right" });

  doc.setFontSize(10);
  doc.text(`Invoice number: ${invoice.reference}`, 14, 32);
  doc.text(`Issue date: ${invoice.issue_date}`, 14, 38);
  if (invoice.due_date) doc.text(`Due date: ${invoice.due_date}`, 14, 44);
  doc.text(`Billed to: ${clientName}`, 14, 50);

  autoTable(doc, {
    startY: 58,
    head: [["Description", "Qty", "Unit", "Amount"]],
    body: lines.map((l) => [
      l.description || "—",
      String(l.quantity),
      money(l.unit_amount_pence),
      money(lineTotalPence(l)),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [45, 114, 100] },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
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

  doc.save(`${invoice.reference}.pdf`);
}
