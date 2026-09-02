// End-to-end coverage for the usage-tier client cap (migration
// 20260901000011): a practice at its active-client cap can't add another
// client, archiving one frees a slot, and reactivating past the cap is
// blocked. Runs the fixture admin down on the 'starter' tier (cap 5) for the
// duration, restores 'unlimited' in afterAll.
//
// The last test covers the token-signup path (migration 20260901000013) and
// self-skips if that migration isn't applied yet.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TAG = `e2ecap${Date.now()}`;
let adminId = "";

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

const activeCount = () =>
  Number(dbQuery<{ n: number }>(`select public.active_client_count('${adminId}') as n;`).rows[0].n);

/** Insert offline (stub) clients tagged for cleanup until the admin sits at cap. */
function fillToCap(cap: number) {
  let guard = 0;
  while (activeCount() < cap && guard++ < 50) {
    dbQuery(
      `insert into public.client_stubs (created_by, first_name, last_name)
       values ('${adminId}', '${TAG}', 'f${guard}');`,
    );
  }
}

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  // starter tier: max_active = 5 (see plan_limits seed in 20260901000010)
  dbQuery(`update public.practice_settings set subscription_plan = 'starter' where admin_id = '${adminId}';`);
  fillToCap(5);
});

test.afterAll(() => {
  dbQuery(`delete from public.client_stubs where created_by = '${adminId}' and first_name = '${TAG}';`);
  dbQuery(`update public.practice_settings set subscription_plan = 'unlimited' where admin_id = '${adminId}';`);
});

test("the DB trigger blocks a direct over-cap insert with PLAN_LIMIT_ACTIVE", () => {
  expect(activeCount()).toBe(5);
  let threw = "";
  try {
    dbQuery(
      `insert into public.client_stubs (created_by, first_name, last_name)
       values ('${adminId}', '${TAG}', 'overcap');`,
    );
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toContain("PLAN_LIMIT_ACTIVE");
  expect(activeCount()).toBe(5);
});

test("Create offline client at cap shows the plan-limit modal and creates nothing", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/clients`, { waitUntil: "load", timeout: 20_000 });

  await page.getByRole("button", { name: /View more options/i }).click();
  await page.getByRole("button", { name: "Create offline client" }).click();
  await page.locator("#stub-first-name").fill(TAG);
  await page.locator("#stub-last-name").fill("uiovercap");
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByText("You've reached your plan's limit")).toBeVisible({ timeout: 15_000 });
  expect(activeCount()).toBe(5);
});

test("archiving a client frees a slot; reactivating past the cap is blocked", () => {
  // free a slot
  const freed = dbQuery<{ id: string }>(
    `update public.client_stubs set archived_at = now()
      where id = (select id from public.client_stubs
                    where created_by = '${adminId}' and first_name = '${TAG}' and archived_at is null limit 1)
      returning id;`,
  ).rows[0].id;
  expect(activeCount()).toBe(4);

  // the slot can now be used
  dbQuery(
    `insert into public.client_stubs (created_by, first_name, last_name) values ('${adminId}', '${TAG}', 'refill');`,
  );
  expect(activeCount()).toBe(5);

  // …but reactivating the one we archived would put us at 6 — blocked
  let threw = "";
  try {
    dbQuery(`update public.client_stubs set archived_at = null where id = '${freed}';`);
  } catch (e) {
    threw = String(e);
  }
  expect(threw).toContain("PLAN_LIMIT_ACTIVE");
  expect(activeCount()).toBe(5);
});

// enforce_client_active_limit never fires for a token signup (admin_id is null
// at INSERT, v_active_before is true at the admin_id UPDATE). Migration
// 20260901000013 closes it inside consume_platform_access_token. This test
// exercises the real RPC and self-skips if that migration isn't live.
test("a token signup at cap is refused by consume_platform_access_token", async () => {
  test.setTimeout(90_000);

  const fixLive = dbQuery<{ def: string }>(
    `select pg_get_functiondef('public.consume_platform_access_token(text)'::regprocedure) as def;`,
  ).rows[0].def.includes("reached its client limit");
  test.skip(!fixLive, "migration 20260901000013 not applied yet");

  expect(activeCount()).toBe(5); // still at the starter cap from beforeAll

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const email = `${TAG}-signup@clarity-e2e-test.dev`;
  const password = "E2eCapSignup2026!";
  let newUserId = "";
  let token = "";

  try {
    // a plain (no stub) token for this practice
    token = dbQuery<{ token: string }>(
      `insert into public.platform_access_token (token, admin_id, is_used)
       values ('${TAG}-tok', '${adminId}', false)
       returning token;`,
    ).rows[0].token;

    // mirror AuthContext's signup: create the auth user, sign in, consume token
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: "client", first_name: "Cap", last_name: "Signup" } },
    });
    if (error || !data.user) throw new Error(`signUp failed: ${error?.message}`);
    newUserId = data.user.id;
    await supabase.auth.signInWithPassword({ email, password });

    const { error: consumeErr } = await supabase.rpc("consume_platform_access_token", {
      input_token: token,
    });

    expect(consumeErr?.message ?? "").toMatch(/reached its client limit/i);

    // the signup never linked to the practice, and the count didn't move
    expect(
      dbQuery<{ admin_id: string | null }>(`select admin_id from public.users where id = '${newUserId}';`).rows[0]
        .admin_id,
    ).toBeNull();
    expect(activeCount()).toBe(5);
  } finally {
    if (newUserId) {
      dbQuery(`delete from public.users where id = '${newUserId}';`);
      dbQuery(`delete from auth.users where id = '${newUserId}';`);
    }
    if (token) dbQuery(`delete from public.platform_access_token where token = '${token}';`);
  }
});
