// Shared with seed-fixtures.mjs — keep both in sync if you change these.
// This spec runs against the local dev server (unlike e2e/stripe, which
// targets the deployed app because Stripe Checkout needs a real redirect
// target) — the settings behavior we're testing here doesn't need that.
export const APP_URL = "http://localhost:5174";

export const FIXTURES = {
  admin: { email: "e2e-settings-admin@clarity-e2e-test.dev", password: "E2eSettingsAdmin2026!" },
  client: { email: "e2e-settings-client@clarity-e2e-test.dev", password: "E2eSettingsClient2026!" },
};

export const SUPABASE_URL = "https://mxyfdvfbdrusbjiozuzx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_bJhV8RTzq2Wpj5dk1tsWgQ_jiNNpuOD";
