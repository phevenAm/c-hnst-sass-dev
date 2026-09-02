// One-time (idempotent) fixture setup for e2e/settings/settings-behavior.spec.ts.
// Run with: node e2e/settings/seed-fixtures.mjs
//
// Creates a dedicated admin + client pair (separate from demo-admin@honest.com,
// which is the public "Try the demo" account and must never have settings
// like auto-cancel or the consent gate flipped on for real). Also resets
// practice_settings to a known baseline and the client's consent flag to
// false, so a prior test run's leftover state can't leak into the next one.
//
// Keep FIXTURES/SUPABASE_URL/SUPABASE_ANON_KEY in sync with ./constants.ts —
// this file can't import that .ts module directly since it runs under plain
// `node`, not the Playwright/tsx TS loader.
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUPABASE_URL = "https://mxyfdvfbdrusbjiozuzx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bJhV8RTzq2Wpj5dk1tsWgQ_jiNNpuOD";

export const FIXTURES = {
  admin: { email: "e2e-settings-admin@clarity-e2e-test.dev", password: "E2eSettingsAdmin2026!" },
  client: { email: "e2e-settings-client@clarity-e2e-test.dev", password: "E2eSettingsClient2026!" },
};

const tmpDir = mkdtempSync(join(tmpdir(), "settings-e2e-seed-"));

function dbQuery(sql) {
  const file = join(tmpDir, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql);
  const out = execFileSync("npx", ["supabase", "db", "query", "--file", file, "--linked"], {
    encoding: "utf8",
    shell: true,
  });
  const jsonStart = out.indexOf("{");
  return JSON.parse(out.slice(jsonStart));
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Admin ──────────────────────────────────────────────────────────────
  let adminId = dbQuery(`select au.id from auth.users au where au.email = '${FIXTURES.admin.email}';`).rows[0]?.id;

  if (!adminId) {
    const { data, error } = await supabase.auth.signUp({
      email: FIXTURES.admin.email,
      password: FIXTURES.admin.password,
      options: {
        data: { role: "admin", first_name: "E2E", last_name: "SettingsAdmin", practice_name: "E2E Settings Test Practice" },
      },
    });
    if (error) throw new Error(`Admin signUp failed: ${error.message}`);
    adminId = data.user.id;
    console.log("Created test admin:", adminId);
  } else {
    console.log("Test admin already exists:", adminId);
  }

  // ── Client ─────────────────────────────────────────────────────────────
  let clientId = dbQuery(`select au.id from auth.users au where au.email = '${FIXTURES.client.email}';`).rows[0]?.id;

  if (!clientId) {
    const { data, error } = await supabase.auth.signUp({
      email: FIXTURES.client.email,
      password: FIXTURES.client.password,
      options: { data: { role: "client", first_name: "E2E", last_name: "SettingsClient" } },
    });
    if (error) throw new Error(`Client signUp failed: ${error.message}`);
    clientId = data.user.id;
    console.log("Created test client:", clientId);
  } else {
    console.log("Test client already exists:", clientId);
  }

  dbQuery(`update public.users set admin_id = '${adminId}' where id = '${clientId}';`);

  // Baseline practice_settings — every test sets the field it cares about
  // explicitly before running, but they should all start from this known
  // state so a previous failed run can't leak into the next.
  dbQuery(`
    insert into public.practice_settings
      (admin_id, reschedule_cutoff_hours, auto_cancel_enabled, payment_deadline_hours, consent_enabled,
       disabled_email_types, subscription_status, subscription_plan, onboarding_required)
    values ('${adminId}', 48, false, 48, false, '{}', 'active', 'unlimited', false)
    on conflict (admin_id) do update set
      reschedule_cutoff_hours = 48,
      auto_cancel_enabled = false,
      payment_deadline_hours = 48,
      consent_enabled = false,
      disabled_email_types = '{}',
      -- e2e admin must clear the SubscriptionGate and the client-cap triggers:
      -- 'active' gets past /subscribe, 'unlimited' makes enforce_client_*_limit
      -- fail open. Specs that test the cap set 'starter'/'growth' themselves and
      -- restore 'unlimited' in afterAll.
      subscription_status = 'active',
      subscription_plan = 'unlimited',
      onboarding_required = false;
  `);

  // Fresh consent state so the gate test can always exercise a client who
  // hasn't agreed yet, regardless of whether a previous run clicked "Continue".
  dbQuery(`update public.users set has_consented = false, consented_at = null where id = '${clientId}';`);

  // Mark the first-run "personalize your account" onboarding wizard as done
  // for both fixtures — it's unrelated to anything under test here, and left
  // incomplete it pops a blocking modal on every fresh login that the specs
  // would otherwise have to fight with (or worse, mistake for the thing
  // they're actually testing, like the consent gate).
  dbQuery(`update public.users set onboarding_completed = true where id in ('${adminId}', '${clientId}');`);

  // Wipe sessions/email_logs the fixture client accumulated from previous
  // runs (each test spec creates its own fresh sessions) so stale rows never
  // leak into a test's assertions.
  dbQuery(`delete from public.email_logs where client_id = '${clientId}';`);
  dbQuery(`delete from public.sessions where client_id = '${clientId}';`);

  console.log("\nFixtures ready:");
  console.log("  admin:", FIXTURES.admin.email);
  console.log("  client:", FIXTURES.client.email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
