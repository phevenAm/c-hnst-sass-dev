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

export type FeatureFlag = "agency" | "messaging";

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

// Mirror of isOn for a default-ON flag: only an explicit "false" / "0" turns
// it off, an unset var leaves it enabled.
const isOff = (raw: unknown): boolean => {
  if (raw === false) return true;
  const token = String(raw ?? "")
    .trim()
    .split(/\s+/)[0];
  return token === "false" || token === "0";
};

/** True when `flag` is switched on for this build. */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  switch (flag) {
    // Agency "manage mode" (multi-admin agencies). On by default — the /agency
    // routes and the mode switch are already account-gated to agency
    // members/managers, so a stray practice never sees it. Force it dark with
    // VITE_FF_AGENCY=false.
    case "agency":
      return !isOff(import.meta.env.VITE_FF_AGENCY);
    // Direct messaging (client ↔ their counsellor). New client-facing surface +
    // a prod migration — kept dark until it's been run in-browser and the copy
    // signed off. Enable with VITE_FF_MESSAGING=true.
    case "messaging":
      return isOn(import.meta.env.VITE_FF_MESSAGING);
    default:
      return false;
  }
}

/** Hook form for components — same value, reads nicely in JSX. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return isFeatureEnabled(flag);
}
