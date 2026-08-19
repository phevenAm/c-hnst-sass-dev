// One-time (idempotent) fixture setup for e2e/stripe/stripe.spec.ts.
// Run with: node e2e/stripe/seed-fixtures.mjs
// Add --reset to also roll an already-active fixture admin back to a fresh
// unsubscribed/unconnected state, so the subscription/Connect tests can
// exercise the inactive -> active transition again instead of no-op'ing.
//
// Creates two real (non-demo) accounts through the same signUp path the app
// itself uses, so the Playwright suite never needs elevated credentials at
// test-run time — only this setup script needs `supabase db query --linked`
// access, to link the client to the admin and seed a session to pay for.
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

const RESET = process.argv.includes("--reset");

export const FIXTURES = {
  admin: { email: "e2e-stripe-admin@clarity-e2e-test.dev", password: "E2eStripeAdmin2026!" },
  client: { email: "e2e-stripe-client@clarity-e2e-test.dev", password: "E2eStripeClient2026!" },
};

const tmpDir = mkdtempSync(join(tmpdir(), "stripe-e2e-seed-"));

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
  let adminId = dbQuery(
    `select au.id from auth.users au where au.email = '${FIXTURES.admin.email}';`,
  ).rows[0]?.id;

  if (!adminId) {
    const { data, error } = await supabase.auth.signUp({
      email: FIXTURES.admin.email,
      password: FIXTURES.admin.password,
      options: {
        data: { role: "admin", first_name: "E2E", last_name: "Admin", practice_name: "E2E Stripe Test Practice" },
      },
    });
    if (error) throw new Error(`Admin signUp failed: ${error.message}`);
    adminId = data.user.id;
    console.log("Created test admin:", adminId);
  } else {
    console.log("Test admin already exists:", adminId);
  }

  // ── Client ─────────────────────────────────────────────────────────────
  let clientId = dbQuery(
    `select au.id from auth.users au where au.email = '${FIXTURES.client.email}';`,
  ).rows[0]?.id;

  if (!clientId) {
    const { data, error } = await supabase.auth.signUp({
      email: FIXTURES.client.email,
      password: FIXTURES.client.password,
      options: { data: { role: "client", first_name: "E2E", last_name: "Client" } },
    });
    if (error) throw new Error(`Client signUp failed: ${error.message}`);
    clientId = data.user.id;
    console.log("Created test client:", clientId);
  } else {
    console.log("Test client already exists:", clientId);
  }

  // Link client to admin directly — bypasses the invite-token dance since
  // this is fixture wiring, not something the suite re-tests.
  dbQuery(`update public.users set admin_id = '${adminId}' where id = '${clientId}';`);

  // ── A fresh unpaid session for the client to pay for ─────────────────────
  // Always create a new one per seed run so re-running the payment test
  // doesn't collide with a session already marked paid from a prior run.
  // Randomised far out in time so repeat runs don't trip check_session_overlap
  // against sessions seeded by earlier runs.
  const offsetDays = 30 + Math.floor(Math.random() * 300);
  const seeded = dbQuery(
    `insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', now() + interval '${offsetDays} days', 50, 'scheduled', 'remote', 5000, false)
     returning id;`,
  );
  console.log("Seeded unpaid session:", seeded.rows[0].id);

  if (RESET) {
    dbQuery(
      `update public.practice_settings
         set subscription_status = 'inactive', stripe_subscription_id = null
       where admin_id = '${adminId}';`,
    );
    console.log("Reset admin subscription_status to inactive");
  }

  console.log("\nFixtures ready:");
  console.log("  admin:", FIXTURES.admin.email);
  console.log("  client:", FIXTURES.client.email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
