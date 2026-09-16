// End-to-end coverage for CreateSessionModal's 3-step regroup (Date &
// location / Session & fee / Confirm) and the behaviour added alongside it:
// a first-time intro screen, an explicit reason when Next is blocked (it
// used to just silently no-op), and a discard confirmation when closing a
// dirty form. Deliberately does NOT drive the MUI date/time picker — same
// call e2e/session-payment/session-payment.spec.ts already made ("driving
// the MUI date/time pickers in Playwright is brittle and not what's under
// test"): every scenario here is reachable from the Date & location step
// without ever picking a date, which the modal already blocks on for a
// different reason (step validation) that's exactly what's under test.
//
// The block-reference-code auto-fill and the rest of the step content are
// covered at the unit/RTL level instead (CreateSessionModal.test.tsx —
// "block reference code auto-fill" describe), which exercises the real
// component tree and Redux store without needing a live date picker.
//
// Prereq: none beyond a working local dev server — this seeds its own
// throwaway admin/client via createAuthUser rather than the shared FIXTURES,
// so it can freely control the intro's localStorage flag per test.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

const TAG = `e2ecsm${Date.now()}`;
const PASSWORD = "E2eCreateSessModal2026!";
const INTRO_KEY = "create_session_modal_intro_seen";

let adminId: string;
let clientId: string;

test.beforeAll(() => {
  adminId = createAuthUser({
    email: `smissah321+${TAG}-admin@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "CSM", last_name: "Admin" },
  });
  clientId = createAuthUser({
    email: `smissah321+${TAG}-client@gmail.com`,
    password: PASSWORD,
    meta: { role: "client", first_name: TAG, last_name: "Client" },
  });
  dbQuery(`
    update public.users set admin_id = '${adminId}' where id = '${clientId}';
    update public.practice_settings
      set subscription_status = 'active', onboarding_required = false, first_client_milestone_shown = true
      where admin_id = '${adminId}';
  `);
});

test.afterAll(() => {
  dbQuery(`delete from public.sessions where created_by = '${adminId}';`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

// Same "Welcome, {name}!" onboarding modal e2e/scheduler/create-session-picker.spec.ts
// dismisses — its backdrop otherwise intercepts every click on the page
// underneath, even with onboarding_required/first_client_milestone_shown
// both already cleared in beforeAll.
async function dismissWelcomeModal(page: Page) {
  const heading = page.locator('h2:has-text("Welcome,")');
  for (let i = 0; i < 8; i++) {
    if (!(await heading.isVisible({ timeout: 800 }).catch(() => false))) return;
    const btn = page.locator('button:has-text("Save")').first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) await btn.click();
    await page.waitForTimeout(500);
  }
}

// introSeen: pass true to skip the one-off intro so a test can get straight
// to the real step content, same as an admin who's opened this before.
async function loginAndOpenModal(page: Page, introSeen: boolean) {
  await page.addInitScript(
    ([seen, key]) => {
      localStorage.setItem("walkthrough_globally_dismissed", "true");
      if (seen) localStorage.setItem(key as string, "true");
    },
    [introSeen, INTRO_KEY] as const,
  );
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', `smissah321+${TAG}-admin@gmail.com`);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });

  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("#boot-splash", { state: "hidden", timeout: 10_000 }).catch(() => {});
  await dismissWelcomeModal(page);
  await page.getByRole("button", { name: "+ New session" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
}

test("shows the one-off intro before the real fields on a first-ever open, and never shows it again", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAndOpenModal(page, false);

  await expect(page.getByText("Booking a session takes 3 quick steps")).toBeVisible();
  await expect(page.getByText("Date & time", { exact: true })).not.toBeVisible();

  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByText("Date & time", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), INTRO_KEY)).toBe("true");

  // Close and reopen — a returning admin (the flag is now set) skips straight
  // to the real content.
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "+ New session" }).click();
  await expect(page.getByText("Date & time", { exact: true })).toBeVisible();
  await expect(page.getByText("Booking a session takes 3 quick steps")).not.toBeVisible();
});

test("clicking Next without a date shows why, instead of silently doing nothing (regression)", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAndOpenModal(page, true);

  await expect(page.getByText("Date & time", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Pick a date & time to continue.").first()).toBeVisible();
  // Still on step 1 of 3 — Session & fee content never mounted.
  await expect(page.getByLabel(/Step 1 of 3/)).toBeVisible();
});

test("asks before discarding a dirty form, and only closes on confirm", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAndOpenModal(page, true);

  // Dirty the form without touching the date picker: flip to Remote and add
  // a meeting link, both on the same (first) step. The radio input itself is
  // display:none (its styled <label> pill is the visible toggle), so
  // clicking the role=radio locator directly hangs on Playwright's
  // visibility check — click the label text instead, same as a real user.
  await page.getByRole("dialog").getByText("Remote", { exact: true }).click();
  await page.getByPlaceholder("Meeting link (optional)").fill("https://example.com/e2e-call");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(/unsaved changes/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByText(/unsaved changes/i)).not.toBeVisible();
  await expect(page.getByRole("dialog").filter({ hasText: "Create session" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Yes, discard" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
