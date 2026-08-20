// End-to-end coverage for /settings (admin). Deliberately read-only against
// the backend: demo-admin@honest.com is the account behind the public "Try
// the demo" flow (see DemoPage.tsx), and most Practice-tab Save buttons
// write straight to the shared practice_settings row with no demo guard
// (only the Profile tab's handleUpdateProfile checks isDemo). Clicking one
// of those Save buttons here would persist a change (e.g. enabling the
// client-consent gate, disabling an email type) into the live public demo.
// So this spec verifies navigation and rendering across every tab instead
// of exercising the Save flows — those are covered against mocked Supabase
// calls in SettingsPage.test.tsx.
import { expect, type Page, test } from "@playwright/test";

const BASE = "http://localhost:5174";

async function dismissOnboarding(page: Page) {
  try {
    await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
    const dismissBtn = page
      .locator('button:has-text("Save"), button:has-text("Skip"), button:has-text("No thanks")')
      .first();
    if (await dismissBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dismissBtn.click();
    }
    await page.waitForTimeout(600);
  } catch {
    // no onboarding modal
  }
}

async function loginAsDemoAdmin(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[type="email"]', "demo-admin@honest.com");
  await page.fill('input[type="password"]', "DemoAdmin2026");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
  await dismissOnboarding(page);
}

test.describe("Admin settings", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsDemoAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: "load" });
    await dismissOnboarding(page);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10000 });
  });

  test("Profile tab is the default and shows the edit-profile form", async () => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel(/display name/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Update profile" })).toBeVisible();
  });

  test("Practice tab renders business, payment, and automation sections", async () => {
    await page.getByRole("button", { name: "Practice" }).click();

    await expect(page.getByRole("heading", { name: "Business information" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bank details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Card payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Calendar sync" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Session automation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reschedule & cancellation cutoff" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Client consent" })).toBeVisible();
  });

  test("Emails tab lists the transactional email templates", async () => {
    await page.getByRole("button", { name: "Emails" }).click();

    await expect(page.getByText("Manage emails")).toBeVisible();
    await expect(page.getByText("Session reminder")).toBeVisible();
    await expect(page.getByText("Session confirmed")).toBeVisible();
    await expect(page.getByText("Payment confirmation")).toBeVisible();
  });

  test("Interface tab lists client, dashboard, and accessibility controls", async () => {
    await page.getByRole("button", { name: "Interface" }).click();

    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accessibility" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Guided tours" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sidebar" })).toBeVisible();
  });

  test("Sidebar expand-button position is a local preference, not a server save", async () => {
    await page.getByRole("button", { name: "Interface" }).click();

    // localStorage-only setting (see SettingsPage.tsx sidebarBtnPos) — safe
    // to change and revert within the test, no backend write involved.
    await page.getByRole("button", { name: "Middle" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("adminSidebarBtnPos"))).toBe("middle");

    await page.getByRole("button", { name: "Top" }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("adminSidebarBtnPos"))).toBe("top");
  });
});
