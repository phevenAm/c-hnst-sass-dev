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

// Read a .env flag value that turns a default-ON feature OFF. Only an explicit
// "false" / "0" disables it; an unset var (or anything else) leaves it enabled.
// Tolerates a trailing inline comment / stray whitespace (dotenv keeps
// everything after `=`, so `VITE_FF_AGENCY=false # this deploy` is the literal
// string "false # this deploy" — take the first token).
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
    // Direct messaging (client ↔ their counsellor). On by default — the code,
    // routes and migrations are all live on main and it's been verified
    // in-browser end to end. The /messages routes and nav entries carry their
    // own auth gating. Force it dark for a deploy with VITE_FF_MESSAGING=false.
    case "messaging":
      return !isOff(import.meta.env.VITE_FF_MESSAGING);
    default:
      return false;
  }
}

/** Hook form for components — same value, reads nicely in JSX. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return isFeatureEnabled(flag);
}
