// One-time (idempotent) fixture setup for e2e/stripe/stripe.spec.ts.
// Run with: node e2e/stripe/seed-fixtures.mjs
// Add --reset to also roll an already-active fixture admin back to a fresh
// unsubscribed/unconnected state, so the subscription/Connect tests can
// exercise the inactive -> active transition again instead of no-op'ing.
//
// Creates two real (non-demo) accounts by inserting straight into auth.users
// (see createAuthUser below) so the Playwright suite never needs elevated
// credentials at test-run time — only this setup script needs `supabase db
// query --linked` access, to make the users, link the client to the admin
// and seed a session to pay for. It also needs a locally-authenticated
// `stripe` CLI (`stripe login`), used here (and by the renewal test itself)
// as the only way to reach Stripe's test-clock time-travel tooling — there's
// no app-facing path for that, nor should there be.
// Keep FIXTURES in sync with ./constants.ts — this file can't import that .ts
// module directly since it runs under plain `node`, not the Playwright/tsx TS
// loader.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GROWTH_PRODUCT_ID = "prod_VAzASNT2h23opo"; // Clarity Growth

const RESET = process.argv.includes("--reset");

export const FIXTURES = {
  admin: { email: "smissah321+e2e-stripe-admin@gmail.com", password: "E2eStripeAdmin2026!" },
  client: { email: "smissah321+e2e-stripe-client@gmail.com", password: "E2eStripeClient2026!" },
  renewalAdmin: {
    email: "smissah321+e2e-stripe-renewal-admin@gmail.com",
    password: "E2eStripeRenewal2026!",
  },
};

function stripeCli(args) {
  const out = execFileSync("stripe", args, { encoding: "utf8", shell: true });
  return JSON.parse(out.slice(out.indexOf("{")));
}

// New fixtures are inserted straight into auth.users rather than via
// supabase.auth.signUp: it sets email_confirmed_at = now() so the account is
// login-ready immediately and no confirmation email is sent to the shared
// smissah321+… inbox. handle_new_user still fires on the insert, and the
// password is bcrypt-hashed so signInWithPassword works like a real signup.
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
  // ── Admin ──────────────────────────────────────────────────────────────
  let adminId = dbQuery(
    `select au.id from auth.users au where au.email = '${FIXTURES.admin.email}';`,
  ).rows[0]?.id;

  if (!adminId) {
    adminId = createAuthUser({
      email: FIXTURES.admin.email,
      password: FIXTURES.admin.password,
      meta: { role: "admin", first_name: "E2E", last_name: "Admin", practice_name: "E2E Stripe Test Practice" },
    });
    console.log("Created test admin:", adminId);
  } else {
    console.log("Test admin already exists:", adminId);
  }

  // ── Client ─────────────────────────────────────────────────────────────
  let clientId = dbQuery(
    `select au.id from auth.users au where au.email = '${FIXTURES.client.email}';`,
  ).rows[0]?.id;

  if (!clientId) {
    clientId = createAuthUser({
      email: FIXTURES.client.email,
      password: FIXTURES.client.password,
      meta: { role: "client", first_name: "E2E", last_name: "Client" },
    });
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

  // ── Renewal admin — a fresh subscription on a Stripe test clock ──────────
  // Lets stripe.spec.ts fast-forward past a real billing cycle and observe
  // whether invoice.payment_succeeded (renewal receipts) actually reaches
  // the webhook, instead of waiting a month for a real one.
  let renewalAdminId = dbQuery(
    `select au.id from auth.users au where au.email = '${FIXTURES.renewalAdmin.email}';`,
  ).rows[0]?.id;

  if (!renewalAdminId) {
    renewalAdminId = createAuthUser({
      email: FIXTURES.renewalAdmin.email,
      password: FIXTURES.renewalAdmin.password,
      meta: { role: "admin", first_name: "E2E", last_name: "Renewal", practice_name: "E2E Renewal Test Practice" },
    });
    console.log("Created renewal test admin:", renewalAdminId);
  } else {
    console.log("Renewal test admin already exists:", renewalAdminId);
  }

  const existingCustomerId = dbQuery(
    `select billing_customer_id from public.practice_settings where admin_id = '${renewalAdminId}';`,
  ).rows[0]?.billing_customer_id;

  // A test clock (and everything attached to it) is auto-deleted by Stripe
  // ~30 days after creation, so re-check it's still alive rather than trusting
  // the DB row on faith.
  let hasLiveTestClock = false;
  if (existingCustomerId) {
    try {
      const customer = stripeCli(["customers", "retrieve", existingCustomerId]);
      hasLiveTestClock = !!customer.test_clock && !customer.deleted;
    } catch {
      hasLiveTestClock = false;
    }
  }

  if (!hasLiveTestClock) {
    console.log("Setting up a fresh Stripe test-clock subscription for the renewal fixture...");

    // Read the live Growth monthly price rather than hardcoding an id, so
    // this keeps working after the price is next recut.
    const prices = stripeCli(["prices", "list", "--product", GROWTH_PRODUCT_ID, "--active=true", "--limit", "10"]);
    const monthlyPrice = prices.data.find((p) => p.recurring?.interval === "month");
    if (!monthlyPrice) throw new Error(`No active monthly price found for product ${GROWTH_PRODUCT_ID}`);

    const now = Math.floor(Date.now() / 1000);
    const clock = stripeCli([
      "test_helpers",
      "test_clocks",
      "create",
      "-d",
      `frozen_time=${now}`,
      "-d",
      "name=e2e-renewal-clock",
    ]);
    const customer = stripeCli([
      "customers",
      "create",
      "-d",
      `test_clock=${clock.id}`,
      "-d",
      `email=${FIXTURES.renewalAdmin.email}`,
      "-d",
      "name=E2E-Renewal-Test",
      "-d",
      "metadata[app]=clarity-e2e",
    ]);
    const pm = stripeCli(["payment_methods", "create", "-d", "type=card", "-d", "card[token]=tok_visa"]);
    stripeCli(["payment_methods", "attach", pm.id, "-d", `customer=${customer.id}`]);
    stripeCli(["customers", "update", customer.id, "-d", `invoice_settings[default_payment_method]=${pm.id}`]);
    const sub = stripeCli([
      "subscriptions",
      "create",
      "-d",
      `customer=${customer.id}`,
      "-d",
      `items[0][price]=${monthlyPrice.id}`,
      "-d",
      `default_payment_method=${pm.id}`,
    ]);

    dbQuery(`
      update public.practice_settings
         set billing_customer_id = '${customer.id}',
             stripe_subscription_id = '${sub.id}',
             subscription_status = 'active',
             subscription_plan = 'growth',
             billing_interval = 'month'
       where admin_id = '${renewalAdminId}';
    `);
    console.log("Renewal fixture ready — customer:", customer.id, "clock:", clock.id, "sub:", sub.id);
  } else {
    console.log("Renewal fixture already has a live test-clock subscription:", existingCustomerId);
  }

  console.log("\nFixtures ready:");
  console.log("  admin:", FIXTURES.admin.email);
  console.log("  client:", FIXTURES.client.email);
  console.log("  renewalAdmin:", FIXTURES.renewalAdmin.email);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
