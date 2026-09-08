// Central registry of build-time feature flags.
//
// Each flag is driven by a VITE_FF_* environment variable. Anything that
// isn't explicitly "true" / "1" counts as OFF, so an unset flag is disabled
// in every environment by default — production stays dark until a flag is
// deliberately switched on for a deploy (Vercel env var, `.env.local`, …).
//
// Usage:
//   import { isFeatureEnabled } from "@/lib/featureFlags";
//   if (isFeatureEnabled("agency")) { … }
//
//   // in a component
//   const agencyOn = useFeatureFlag("agency");

export type FeatureFlag = "agency";

// Tolerate a trailing inline comment / stray whitespace in a .env value
// (dotenv keeps everything after `=`, so `VITE_FF_AGENCY=true # on` is the
// literal string "true # on" — take the first token).
const isOn = (raw: unknown): boolean => {
  if (raw === true) return true;
  const token = String(raw ?? "")
    .trim()
    .split(/\s+/)[0];
  return token === "true" || token === "1";
};

/** True when `flag` is switched on for this build. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  switch (flag) {
    // Agency "manage mode" (multi-admin agencies). Half-built — kept dark in
    // production until the agency flows are finished and tested. Enable on a
    // preview / staging deploy with VITE_FF_AGENCY=true.
    case "agency":
      return isOn(import.meta.env.VITE_FF_AGENCY);
    default:
      return false;
  }
}

/** Hook form for components — same value, reads nicely in JSX. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return isFeatureEnabled(flag);
}
