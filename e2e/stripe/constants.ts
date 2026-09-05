// Shared with seed-fixtures.mjs — keep both in sync if you change these.
export const APP_URL = "https://withclarity.uk";

export const FIXTURES = {
  admin: { email: "e2e-stripe-admin@clarity-e2e-test.dev", password: "E2eStripeAdmin2026!" },
  client: { email: "e2e-stripe-client@clarity-e2e-test.dev", password: "E2eStripeClient2026!" },
  // Pre-wired to a Stripe test-clock subscription by seed-fixtures.mjs, so
  // stripe.spec.ts can fast-forward it through a renewal without waiting a
  // real billing cycle. See that script for how the clock/customer/sub are set up.
  renewalAdmin: {
    email: "e2e-stripe-renewal-admin@clarity-e2e-test.dev",
    password: "E2eStripeRenewal2026!",
  },
};

export const SUPABASE_URL = "https://mxyfdvfbdrusbjiozuzx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bJhV8RTzq2Wpj5dk1tsWgQ_jiNNpuOD";
