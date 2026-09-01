// End-to-end coverage for: a session the admin books for a client shows up on
// the client's calendar as unpaid, and once the admin marks it paid the client
// sees it as paid too.
//
// The session is inserted via dbQuery (driving the CreateSessionModal's MUI
// date/time pickers in Playwright is brittle and not what's under test). The
// two things under test — the client seeing it, and the mark-as-paid round
// trip — go through the real UI.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let sessionId = "";
const PRICE_PENCE = 5500; // £55

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  clientId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.client.email}';`).rows[0].id;

  sessionId = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', now() + interval '3 days', 50, 'scheduled', 'in_person', ${PRICE_PENCE}, false)
     returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  dbQuery(`delete from public.payments where session_id = '${sessionId}';`);
  dbQuery(`delete from public.sessions where id = '${sessionId}';`);
});

test("the client sees the booked session on /my-sessions, unpaid", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, FIXTURES.client.email, FIXTURES.client.password);
  await page.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20_000 });

  await expect(page.getByText(/£55/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Payment pending/i).first()).toBeVisible();
  await expect(page.getByText(/^Paid$/).first()).toHaveCount(0);
});

test("admin marks it paid; the client then sees it as paid", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // ── admin marks the session paid from the client's detail page ──
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });

  // open the session (its card carries the mark-as-paid control)
  await page.getByText(/£55/).first().click();
  await page
    .getByRole("button", { name: /Mark as paid/i })
    .first()
    .click();
  // ConfirmModal
  await page.getByRole("button", { name: "Mark as paid", exact: true }).click();

  await expect
    .poll(
      () => dbQuery<{ paid: boolean }>(`select paid from public.sessions where id = '${sessionId}';`).rows[0].paid,
      { timeout: 15_000 },
    )
    .toBe(true);

  // ── client reloads and sees "Paid" ──
  const client = await browser.newPage();
  await login(client, FIXTURES.client.email, FIXTURES.client.password);
  await client.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20_000 });
  await expect(client.getByText(/^Paid$/).first()).toBeVisible({ timeout: 15_000 });
  await client.close();
});
