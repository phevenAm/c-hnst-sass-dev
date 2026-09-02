// Small money helpers shared across the manage-mode screens. Amounts are stored
// in pence (integer) everywhere, matching the payments table.

export const formatPence = (pence: number | null | undefined): string =>
  `£${((pence ?? 0) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const poundsToPence = (pounds: string | number): number | null => {
  const n = typeof pounds === "string" ? parseFloat(pounds) : pounds;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

export const penceToPoundsInput = (pence: number | null | undefined): string =>
  pence == null ? "" : (pence / 100).toString();
