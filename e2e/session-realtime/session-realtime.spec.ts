// End-to-end coverage for the session realtime feed against the real DB.
//
// The bug this prevents: useSessionsRealtime only listened for UPDATEs, so an
// open admin tab never learned that a session was ADDED (a new booking, or
// the rows imported when a stub client signs up) or DELETED without a manual
// reload — and a stale card then fired a cancel/delete for a row that was
// already gone ("session not found" 404).
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let originalSubStatus = "active";
const created: string[] = [];

function mkSession(startsSqlExpr: string): string {
  const id = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', ${startsSqlExpr}, 50, 'scheduled', 'remote', 5000, false)
     returning id;`,
  ).rows[0].id;
  created.push(id);
  return id;
}

// One "Click to add notes" affordance per admin session card — a stable way to
// count how many session cards are on the page.
const cardCount = (page: Page) => page.getByText("Click to add notes").count();

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
  originalSubStatus = dbQuery<{ v: string }>(
    `select subscription_status as v from public.practice_settings where admin_id = '${adminId}';`,
  ).rows[0].v;
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
    `update public.practice_settings set subscription_status = '${originalSubStatus}' where admin_id = '${adminId}';`,
  );
  dbQuery(`delete from public.sessions where client_id = '${clientId}';`);
});

// Wait for the sessions list to be rendered from the initial fetch, then give
// the realtime channel a beat to actually subscribe before we mutate the DB.
async function openClientAndSettle(page: Page, expectCards: number) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAdmin(page);
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });
  await expect.poll(() => cardCount(page), { timeout: 30_000 }).toBe(expectCards);
  await page.waitForTimeout(3_000);
}

test("a session added elsewhere appears in an open tab without a reload", async ({ page }) => {
  test.setTimeout(120_000);
  // one session already on the page (rendered by the initial fetch, not realtime)
  mkSession("now() + interval '2 days'");
  await openClientAndSettle(page, 1);

  // now insert another straight into the DB — the open tab must pick it up live
  mkSession("now() + interval '4 days'");
  await expect.poll(() => cardCount(page), { timeout: 30_000, message: "realtime INSERT adds the card" }).toBe(2);
});

test("a session deleted elsewhere disappears from an open tab without a reload", async ({ page }) => {
  test.setTimeout(120_000);
  const keep = mkSession("now() + interval '2 days'");
  const drop = mkSession("now() + interval '6 days'");
  await openClientAndSettle(page, 2);

  dbQuery(`delete from public.sessions where id = '${drop}';`);
  created.splice(created.indexOf(drop), 1);

  await expect.poll(() => cardCount(page), { timeout: 30_000, message: "realtime DELETE removes the card" }).toBe(1);
  expect(created).toContain(keep);
});
