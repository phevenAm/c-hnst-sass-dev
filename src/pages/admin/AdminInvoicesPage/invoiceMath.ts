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
