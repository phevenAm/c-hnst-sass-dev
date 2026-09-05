// End-to-end coverage for the client lifecycle: deactivate → login blocked →
// reactivate → login works; deactivate + anonymise → codename replaces the
// name on the Clients page; hard delete → the account is gone.
//
// Runs against the local dev server + the shared e2e-settings-admin fixture.
// Uses a THROWAWAY client it signs up in beforeAll (never the shared fixture
// client — anonymise scrubs auth.users.email and a mid-run failure would brick
// it for every other spec). afterAll hard-removes whatever survives.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs` (sets the admin to an active
// 'unlimited' subscription so it clears /subscribe and the client-cap triggers).

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TS = Date.now();
const LC = { email: `smissah321+e2e-lifecycle-${TS}@gmail.com`, password: "E2eLifecycle2026!" };
let adminId = "";
let clientId = ""; // cleared once test 3 deletes the row

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;

  clientId = createAuthUser({
    email: LC.email,
    password: LC.password,
    meta: { first_name: "Lifecycle", last_name: "Tester" },
  });

  dbQuery(`update public.users set admin_id = '${adminId}', onboarding_completed = true where id = '${clientId}';`);
});

test.afterAll(() => {
  if (!clientId) return;
  dbQuery(`delete from public.email_logs where client_id = '${clientId}';`);
  dbQuery(`delete from public.session_notes where user_id = '${clientId}';`);
  dbQuery(`delete from public.users where id = '${clientId}';`);
  dbQuery(`delete from auth.users where id = '${clientId}';`);
  // preserve_notes_on_user_delete makes a "Former / Client" stub only if notes
  // existed — there were none, but sweep anyway in case a test added some.
  dbQuery(`delete from public.client_stubs where created_by = '${adminId}' and first_name in ('Former', 'Lifecycle');`);
});

test("deactivate blocks the client's login; reactivate restores it", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // sanity: the client can sign in to begin with
  const pre = await browser.newPage();
  await login(pre, LC.email, LC.password);
  await pre.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 20_000 });
  await pre.close();

  // ── admin deactivates ──
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });

  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Deactivate this client?")).toBeVisible();
  // confirm button inside the dialog carries the same label — take the last
  await page.getByRole("button", { name: "Deactivate" }).last().click();
  await expect(page.getByText("Client is deactivated")).toBeVisible({ timeout: 15_000 });

  const afterDeact = dbQuery<{ archived_at: string | null; banned: string | null }>(
    `select u.archived_at, a.banned_until::text as banned
       from public.users u join auth.users a on a.id = u.id where u.id = '${clientId}';`,
  ).rows[0];
  expect(afterDeact.archived_at).not.toBeNull();
  expect(afterDeact.banned).not.toBeNull();

  // ── client can no longer sign in ──
  const blocked = await browser.newPage();
  await login(blocked, LC.email, LC.password);
  await blocked.waitForTimeout(4000);
  await expect(blocked).toHaveURL(/\/login/);
  await expect(blocked.locator('input[type="password"]')).toBeVisible();
  await blocked.close();

  // ── admin reactivates ──
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("button", { name: "Deactivate" })).toBeVisible({ timeout: 15_000 });

  expect(
    dbQuery<{ archived_at: string | null }>(`select archived_at from public.users where id = '${clientId}';`).rows[0]
      .archived_at,
  ).toBeNull();

  // ── client can sign in again ──
  const restored = await browser.newPage();
  await login(restored, LC.email, LC.password);
  await restored.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 20_000 });
  await restored.close();
});

test("deactivate + anonymise: the Clients page shows a codename, not the name", async ({ page }) => {
  test.setTimeout(90_000);

  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });

  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("checkbox").check(); // "also anonymise"
  await page.getByRole("button", { name: "Deactivate" }).last().click();
  await expect(page.getByText(/Deactivated · anonymised/)).toBeVisible({ timeout: 15_000 });

  const scrubbed = dbQuery<{
    first_name: string | null;
    anonymised_at: string | null;
    admin_codename: string | null;
    email: string;
  }>(
    `select u.first_name, u.anonymised_at, u.admin_codename, a.email
       from public.users u join auth.users a on a.id = u.id where u.id = '${clientId}';`,
  ).rows[0];
  expect(scrubbed.first_name).toBeNull();
  expect(scrubbed.anonymised_at).not.toBeNull();
  expect(scrubbed.admin_codename).toMatch(/^Client /);
  expect(scrubbed.email).toContain("@deleted.invalid");

  // Clients page → Deactivated tab → row shows the codename, never the old name
  await page.goto(`${APP_URL}/admin/clients`, { waitUntil: "load", timeout: 20_000 });
  await page.getByRole("tab", { name: /Deactivated/ }).click();
  await expect(page.getByText(scrubbed.admin_codename as string)).toBeVisible();
  await expect(page.getByText("Lifecycle Tester")).toHaveCount(0);
});

test("hard delete removes the account entirely", async ({ page }) => {
  test.setTimeout(90_000);

  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });

  await page.getByRole("button", { name: "Delete client" }).click();
  await page.getByRole("button", { name: "confirm user deletion" }).click();
  await page.waitForURL((u) => u.pathname === "/admin/clients", { timeout: 20_000 });

  const gone = dbQuery<{ n: number }>(
    `select
       (select count(*) from public.users where id = '${clientId}')
     + (select count(*) from auth.users where id = '${clientId}') as n;`,
  ).rows[0].n;
  expect(Number(gone)).toBe(0);

  clientId = ""; // afterAll no longer has anything to clean
});
