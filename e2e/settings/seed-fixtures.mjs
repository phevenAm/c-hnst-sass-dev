// One-time (idempotent) fixture setup for e2e/settings/settings-behavior.spec.ts.
// Run with: node e2e/settings/seed-fixtures.mjs
//
// Creates a dedicated admin + client pair (separate from demo-admin@honest.com,
// which is the public "Try the demo" account and must never have settings
// like auto-cancel or the consent gate flipped on for real). Also resets
// practice_settings to a known baseline and the client's consent flag to
// false, so a prior test run's leftover state can't leak into the next one.
//
// Keep FIXTURES in sync with ./constants.ts — this file can't import that .ts
// module directly since it runs under plain `node`, not the Playwright/tsx TS
// loader.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIXTURES = {
  admin: { email: "smissah321+e2e-settings-admin@gmail.com", password: "E2eSettingsAdmin2026!" },
  client: { email: "smissah321+e2e-settings-client@gmail.com", password: "E2eSettingsClient2026!" },
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

// Create a login-capable auth user by inserting straight into auth.users
// rather than via supabase.auth.signUp: it sets email_confirmed_at = now() so
// the account is usable immediately and GoTrue sends no confirmation email to
// the shared smissah321+… inbox. handle_new_user fires on the insert and
// makes the matching public.users row; the password is bcrypt-hashed (cost 10,
// matching GoTrue) so signInWithPassword / a browser login still works. Twin
// of e2e/settings/db.ts createAuthUser and e2e/stripe/seed-fixtures.mjs.
function createAuthUser({ email, password, meta }) {
  const metaJson = JSON.stringify(meta).replace(/'/g, "''");
  return dbQuery(`
    insert into auth.users
      (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role,
       raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', '${email}',
            extensions.crypt('${password}', extensions.gen_salt('bf', 10)), now(),
            'authenticated', 'authenticated', '${metaJson}'::jsonb,
            '{"provider":"email","providers":["email"]}'::jsonb, now(), now(),
            '', '', '', '')
    returning id;
  `).rows[0].id;
}

async function main() {
  // ── Admin ──────────────────────────────────────────────────────────────
  let adminId = dbQuery(`select au.id from auth.users au where au.email = '${FIXTURES.admin.email}';`).rows[0]?.id;

  if (!adminId) {
    adminId = createAuthUser({
      email: FIXTURES.admin.email,
      password: FIXTURES.admin.password,
      meta: { role: "admin", first_name: "E2E", last_name: "SettingsAdmin", practice_name: "E2E Settings Test Practice" },
    });
    console.log("Created test admin:", adminId);
  } else {
    console.log("Test admin already exists:", adminId);
  }

  // ── Client ─────────────────────────────────────────────────────────────
  let clientId = dbQuery(`select au.id from auth.users au where au.email = '${FIXTURES.client.email}';`).rows[0]?.id;

  if (!clientId) {
    clientId = createAuthUser({
      email: FIXTURES.client.email,
      password: FIXTURES.client.password,
      meta: { role: "client", first_name: "E2E", last_name: "SettingsClient" },
    });
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
