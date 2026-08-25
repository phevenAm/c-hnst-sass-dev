const STORAGE_KEY = "referral_code";

// A referral code is picked up wherever a visitor first lands with ?ref=
// (typically /register) but isn't actually used until they complete signup
// and reach the Stripe checkout call on /subscribe — a full page navigation
// away, so a plain query param or component state won't survive the trip.
// sessionStorage does, without needing to thread it through every route.
export function captureReferralCode(search: string): void {
  const code = new URLSearchParams(search).get("ref");
  if (code?.trim()) {
    sessionStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
  }
}

export function getReferralCode(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}
