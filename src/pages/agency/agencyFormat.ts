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

export type SeatUsage = { pct: number; over: boolean; atLimit: boolean; unlimited: boolean };

// Drives the "N of M staff places used" bar in AgencySettingsPage. `max` null
// means the unlimited tier — always shows full, never "over" or "at limit".
export function staffSeatUsage(active: number, max: number | null): SeatUsage {
  if (max == null) return { pct: 100, over: false, atLimit: false, unlimited: true };
  return {
    pct: Math.min(100, Math.round((active / Math.max(max, 1)) * 100)),
    over: active > max,
    atLimit: active >= max,
    unlimited: false,
  };
}
