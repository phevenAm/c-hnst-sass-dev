// Shared with seed-fixtures.mjs — keep both in sync if you change these.
export const APP_URL = "https://withclarity.uk";

// Gmail "+" aliases (all land in smissah321@gmail.com, filter by the +tag) so
// the app's real transactional emails to these addresses actually deliver
// instead of hard-bouncing a fake domain and hurting Resend sender reputation.
export const FIXTURES = {
  admin: { email: "smissah321+e2e-stripe-admin@gmail.com", password: "E2eStripeAdmin2026!" },
  client: { email: "smissah321+e2e-stripe-client@gmail.com", password: "E2eStripeClient2026!" },
  // Pre-wired to a Stripe test-clock subscription by seed-fixtures.mjs, so
  // stripe.spec.ts can fast-forward it through a renewal without waiting a
  // real billing cycle. See that script for how the clock/customer/sub are set up.
  renewalAdmin: {
    email: "smissah321+e2e-stripe-renewal-admin@gmail.com",
    password: "E2eStripeRenewal2026!",
  },
};

export const SUPABASE_URL = "https://mxyfdvfbdrusbjiozuzx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bJhV8RTzq2Wpj5dk1tsWgQ_jiNNpuOD";
