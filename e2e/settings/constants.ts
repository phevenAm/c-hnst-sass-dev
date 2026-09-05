// Shared with seed-fixtures.mjs — keep both in sync if you change these.
// This spec runs against the local dev server (unlike e2e/stripe, which
// targets the deployed app because Stripe Checkout needs a real redirect
// target) — the settings behavior we're testing here doesn't need that.
export const APP_URL = "http://localhost:5174";

// Gmail "+" aliases (all land in smissah321@gmail.com, filter by the +tag) so
// the app's real transactional emails to these addresses actually deliver
// instead of hard-bouncing a fake domain and hurting Resend sender reputation.
export const FIXTURES = {
  admin: { email: "smissah321+e2e-settings-admin@gmail.com", password: "E2eSettingsAdmin2026!" },
  client: { email: "smissah321+e2e-settings-client@gmail.com", password: "E2eSettingsClient2026!" },
};

export const SUPABASE_URL = "https://mxyfdvfbdrusbjiozuzx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bJhV8RTzq2Wpj5dk1tsWgQ_jiNNpuOD";
