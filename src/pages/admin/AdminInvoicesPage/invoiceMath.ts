// Pure money helpers for invoicing. Amounts are always integer pence.

export type LineLike = { quantity: number; unit_amount_pence: number };

/** Total for a single line, rounded to whole pence. */
export const lineTotalPence = (line: LineLike): number =>
  Math.round((Number(line.quantity) || 0) * (Number(line.unit_amount_pence) || 0));

/** Sum of every line on an invoice. */
export const invoiceTotalPence = (lines: LineLike[]): number => lines.reduce((sum, l) => sum + lineTotalPence(l), 0);

/** "INV-" + 7 → "INV-0007". Pads to at least 4 digits; longer numbers pass through. */
export const formatReference = (prefix: string, n: number): string => `${prefix}${String(n).padStart(4, "0")}`;

/** £ display from pence. */
export const money = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

/** The due date to seed a fresh invoice with: an existing invoice keeps its
 *  stored value; a new one inherits the practice's default payment-terms window
 *  (Settings → Invoicing), added to the issue date — or none if unset. */
export const initialDueDate = (
  existing: { due_date: string | null } | null,
  issueDate: string,
  termsDays: number | null,
): string => {
  if (existing) return existing.due_date ?? "";
  if (termsDays == null || !Number.isFinite(termsDays)) return "";
  const d = new Date(`${issueDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + termsDays);
  return d.toISOString().slice(0, 10);
};

/** The wordmark shown in the invoice PDF's top band: the practice's business
 *  name, or "Clarity" as a fallback when it isn't set. Whitespace-only names
 *  count as empty. */
export const invoiceBandBrand = (businessName: string | null | undefined): string => businessName?.trim() || "Clarity";

/** "#1f4940" → [31, 73, 64] for jsPDF's setDrawColor/setTextColor. Returns null
 *  for anything that isn't a 6-digit hex, so callers can fall back to a default. */
export const hexToRgb = (hex: string | null | undefined): [number, number, number] | null => {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
};
