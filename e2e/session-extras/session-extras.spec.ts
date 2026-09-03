// End-to-end coverage against the real DB for two fixes made while chasing the
// "app is full of bugs" reports:
//   1. cancel-session is idempotent — an already-cancelled session returns OK,
//      not a "session not found" 404 (which a stale card used to trigger).
//   2. Finances → Overview "Recent activity" respects the codename setting.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let originalSubStatus = "active";
let originalCodenames = false;
const created: string[] = [];

function mkSession(startsSqlExpr: string, opts: { paid?: boolean; status?: string } = {}): string {
  const id = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', ${startsSqlExpr}, 50, '${opts.status ?? "scheduled"}', 'remote', 5000, ${opts.paid ?? false})
     returning id;`,
  ).rows[0].id;
  created.push(id);
  return id;
}

const status = (id: string) =>
  dbQuery<{ s: string }>(`select status as s from public.sessions where id = '${id}';`).rows[0].s;

async function adminToken(): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({
    email: FIXTURES.admin.email,
    password: FIXTURES.admin.password,
  });
  if (error || !data.session) throw new Error(`admin sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

async function loginAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', FIXTURES.admin.email);
  await page.fill('input[type="password"]', FIXTURES.admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  clientId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.client.email}';`).rows[0].id;
  dbQuery(`update public.users set admin_id = '${adminId}' where id = '${clientId}';`);
  const ps = dbQuery<{ sub: string; cn: boolean }>(
    `select subscription_status as sub, use_client_codenames as cn from public.practice_settings where admin_id = '${adminId}';`,
  ).rows[0];
  originalSubStatus = ps.sub;
  originalCodenames = ps.cn;
  dbQuery(`update public.practice_settings set subscription_status = 'active' where admin_id = '${adminId}';`);
  dbQuery(`delete from public.sessions where created_by = '${adminId}';`);
});

test.afterEach(() => {
  if (created.length) {
    dbQuery(`delete from public.sessions where id in (${created.map((i) => `'${i}'`).join(",")});`);
    created.length = 0;
  }
});

test.afterAll(() => {
  dbQuery(
    `update public.practice_settings
       set subscription_status = '${originalSubStatus}', use_client_codenames = ${originalCodenames}
     where admin_id = '${adminId}';`,
  );
  dbQuery(`update public.users set admin_codename = null where id = '${clientId}';`);
  dbQuery(`delete from public.sessions where client_id = '${clientId}';`);
});

test("cancel-session cancels a scheduled session (happy path)", async () => {
  const id = mkSession("now() + interval '3 days'");
  const token = await adminToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ session_id: id }),
  });
  expect(res.status).toBe(200);
  expect(status(id)).toBe("cancelled");
});

test("cancel-session on an already-cancelled session returns OK, not a 404 (sad path)", async () => {
  const id = mkSession("now() + interval '3 days'", { status: "cancelled" });
  const token = await adminToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ session_id: id }),
  });
  expect(res.status, "already-cancelled must not 404").toBe(200);
  expect((await res.json()).already_cancelled).toBe(true);
});

test("cancel-session on a genuinely missing session still 404s (sad path)", async () => {
  const token = await adminToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ session_id: "00000000-0000-0000-0000-000000000000" }),
  });
  expect(res.status).toBe(404);
});

test("Finances recent activity shows the codename when codename mode is on (happy path)", async ({ page }) => {
  test.setTimeout(90_000);
  dbQuery(`update public.practice_settings set use_client_codenames = true where admin_id = '${adminId}';`);
  dbQuery(`update public.users set admin_codename = 'Kestrel' where id = '${clientId}';`);
  mkSession("now() - interval '2 days'", { paid: true });

  await loginAdmin(page);
  await page.goto(`${APP_URL}/admin/finances`, { waitUntil: "load", timeout: 20_000 });

  await expect(page.getByText(/Payment from Kestrel/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/E2E SettingsClient/i)).toHaveCount(0);
});

test("Finances recent activity shows the real name when codename mode is off (sad path)", async ({ page }) => {
  test.setTimeout(90_000);
  dbQuery(`update public.practice_settings set use_client_codenames = false where admin_id = '${adminId}';`);
  dbQuery(`update public.users set admin_codename = 'Kestrel' where id = '${clientId}';`);
  mkSession("now() - interval '2 days'", { paid: true });

  await loginAdmin(page);
  await page.goto(`${APP_URL}/admin/finances`, { waitUntil: "load", timeout: 20_000 });

  await expect(page.getByText(/Payment from E2E SettingsClient/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Kestrel/)).toHaveCount(0);
});
