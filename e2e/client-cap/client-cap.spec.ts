// End-to-end coverage for the usage-tier client cap (migration
// 20260901000011): a practice at its active-client cap can't add another
// client, archiving one frees a slot, and reactivating past the cap is
// blocked. Runs the fixture admin down on the 'starter' tier (cap 5) for the
// duration, restores 'unlimited' in afterAll.
//
// KNOWN GAP (test.fixme below): a client signing up via an access token is
// NOT checked against the cap — enforce_client_active_limit skips the INSERT
// (admin_id still null) and the later admin_id UPDATE (v_active_before true).
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
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

// KNOWN GAP — enable once enforce_client_active_limit also covers the
// signup path (INSERT with admin_id null, then the admin_id UPDATE).
test.fixme("a client signing up via an access token is capped too", () => {
  // A token-signup at cap currently succeeds: neither the handle_new_user
  // INSERT (admin_id null → trigger skips) nor the consume_platform_access_token
  // UPDATE (v_active_before = true → trigger skips) is enforced.
});
