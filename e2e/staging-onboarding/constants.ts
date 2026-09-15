// Targets the deployed STAGING app/project specifically — this spec exists to
// answer "does sign-up -> email confirm -> subscribe work as one real user
// journey on staging", so it must run against staging, not prod (which would
// mean real signups/real card attempts against the live Stripe key) and not
// localhost (Stripe Checkout needs a real redirect target, same reasoning as
// e2e/stripe).
export const APP_URL = "https://clarity-staging-two.vercel.app";
export const SUPABASE_URL = "https://epxozsqdxqicjpbxtjez.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ID5bB4iV9VHdPZHKjXpE7g_NnteNs4U";
export const STAGING_PROJECT_REF = "epxozsqdxqicjpbxtjez";

// Gmail "+" alias so a real confirmation email (if one ever needs to be
// inspected by hand) lands in smissah321@gmail.com, not a fake domain.
export const testEmail = (tag: string) => `smissah321+e2e-staging-onboard-${tag}-${Date.now()}@gmail.com`;
export const PASSWORD = "E2eStagingOnboard2026!";
