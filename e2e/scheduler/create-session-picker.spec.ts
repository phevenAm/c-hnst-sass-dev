// The "Create a session" split-button on /admin/scheduler, when clicked
// without a pre-picked client, opens a "Who is this session for?" picker.
// That picker's <select> used to be bound directly to the same state
// (newSessionClientId) that also gated whether the picker itself, or
// CreateSessionModal, was on screen — so choosing ANY client from the
// dropdown unmounted the picker the instant onChange fired, before its own
// "Continue" button's stub-vs-real-client branch ever ran. For a real client
// this accidentally still worked (a different render condition happened to
// pick up the same state and show CreateSessionModal), but picking an
// offline/stub client hit a dead end — everything just vanished, no modal,
// no navigation. Never caught because this flow had no e2e coverage at all.
import { expect, type Page, test } from "@playwright/test";

import { APP_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

async function loginViaUi(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

async function dismissWelcomeModal(page: Page) {
  const heading = page.locator('h2:has-text("Welcome,")');
  for (let i = 0; i < 8; i++) {
    if (!(await heading.isVisible({ timeout: 800 }).catch(() => false))) return;
    const btn = page.locator('button:has-text("Save")').first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) await btn.click();
    await page.waitForTimeout(500);
  }
}

const TAG = `e2esched${Date.now()}`;
const PASSWORD = "E2eSchedPicker2026!";

let adminId: string;
let realClientId: string;
let stubId: string;

test.beforeAll(() => {
  adminId = createAuthUser({
    email: `smissah321+${TAG}-admin@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Sched", last_name: "Picker" },
  });
  realClientId = createAuthUser({
    email: `smissah321+${TAG}-client@gmail.com`,
    password: PASSWORD,
    meta: { role: "client", first_name: TAG, last_name: "RealClient" },
  });
  dbQuery(`
    update public.users set admin_id = '${adminId}' where id = '${realClientId}';
    update public.practice_settings
      set subscription_status = 'active', onboarding_required = false, first_client_milestone_shown = true
      where admin_id = '${adminId}';
  `);
  stubId = dbQuery<{ id: string }>(
    `insert into public.client_stubs (first_name, last_name, created_by) values ('${TAG}', 'StubClient', '${adminId}') returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  dbQuery(`delete from public.sessions where created_by = '${adminId}';`);
  dbQuery(`delete from public.client_stubs where id = '${stubId}';`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

async function openPicker(page: Page) {
  await page.goto(`${APP_URL}/admin/scheduler`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("#boot-splash", { state: "hidden", timeout: 10_000 }).catch(() => {});
  await dismissWelcomeModal(page);
  await page.getByRole("button", { name: "Create a session", exact: true }).click();
  await expect(page.getByText("Who is this session for?")).toBeVisible({ timeout: 10_000 });
}

test("picking an offline/stub client navigates to their stub page instead of the picker silently vanishing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginViaUi(page, `smissah321+${TAG}-admin@gmail.com`, PASSWORD);
  await openPicker(page);

  await page.selectOption("#new-session-client", stubId);
  // Regression check: the picker must still be showing right after the pick —
  // this is exactly the moment the old code unmounted it via the shared state.
  await expect(page.getByText("Who is this session for?")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/clients/stub/${stubId}$`), { timeout: 10_000 });
});

test("picking a real client opens CreateSessionModal", async ({ page }) => {
  test.setTimeout(60_000);
  await loginViaUi(page, `smissah321+${TAG}-admin@gmail.com`, PASSWORD);
  await openPicker(page);

  await page.selectOption("#new-session-client", realClientId);
  await expect(page.getByText("Who is this session for?")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(`Create session - ${TAG} RealClient`)).toBeVisible({ timeout: 10_000 });
});
