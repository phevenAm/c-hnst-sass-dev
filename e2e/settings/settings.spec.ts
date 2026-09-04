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

// Clicking through OnboardingModal doesn't work for the demo account: per
// 20260831000000_reset_demo_onboarding.sql, AuthContext.updateProfile
// short-circuits for is_demo and never writes onboarding_completed to the
// DB, so the modal reappears on every fresh navigation — and this spec's
// beforeEach does a fresh page.goto() before every single test. A one-time
// click in beforeAll (the old approach) only ever dismissed it for the very
// first test. Remove the dialog from the DOM instead, permanently, for the
// life of this page — addInitScript + a MutationObserver survive every
// subsequent navigation without needing to re-run per test.
async function suppressOnboardingModal(page: Page) {
  await page.addInitScript(() => {
    const remove = () => {
      document.querySelectorAll('[aria-label="Personalize your account"]').forEach((dialog) => {
        (dialog.parentElement ?? dialog).remove();
      });
    };
    // addInitScript runs before the page's own markup/scripts — document.body
    // (and possibly documentElement) may not exist yet, so observing it
    // immediately can silently no-op. Defer setup to DOMContentLoaded, which
    // still fires well before React mounts and renders the modal.
    const start = () => {
      remove();
      new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
  });
}

async function loginAsDemoAdmin(page: Page) {
  await suppressOnboardingModal(page);
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[type="email"]', "demo-admin@honest.com");
  await page.fill('input[type="password"]', "DemoAdmin2026");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
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
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10000 });
  });

  test("Profile tab is the default and shows the edit-profile form", async () => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /display name/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update profile" })).toBeVisible();
  });

  // The 2026-09-03 tab rework (6 tabs: Profile / Practice / Schedule & bookings
  // / Billing / Emails / Interface & accessibility) split what used to be one
  // "Practice" tab across three — this spec wasn't updated to match at the
  // time, so it kept clicking "Practice" and asserting headings that had
  // actually moved to Schedule & bookings / Billing. Split to match reality.
  test("Practice tab renders business info and client consent", async () => {
    await page.getByRole("button", { name: "Practice" }).click();

    await expect(page.getByRole("heading", { name: "Business information" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Client consent" })).toBeVisible();
  });

  test("Schedule & bookings tab renders calendar sync and session automation", async () => {
    await page.getByRole("button", { name: "Schedule & bookings" }).click();

    await expect(page.getByRole("heading", { name: "Calendar sync" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Session automation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reschedule & cancellation cutoff" })).toBeVisible();
  });

  test("Billing tab renders bank details, card payments, and the pause/delete card", async () => {
    await page.getByRole("button", { name: "Billing" }).click();

    await expect(page.getByRole("heading", { name: "Bank details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Card payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pause or close your practice" })).toBeVisible();
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
    // "Sidebar" was never its own section — the sidebar expand-button
    // control lives as a row inside "Accessibility" (asserted above).
    await expect(page.getByText("Sidebar expand button")).toBeVisible();
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
