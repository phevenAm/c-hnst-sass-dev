import { expect, type Page, test } from "@playwright/test";

import { createAuthUser, dbQuery } from "../settings/db";

const BASE = "http://localhost:5174";
const TAG = `sbv${Date.now()}`;

// Regression coverage for: SplitButton's dropdown getting clipped by an
// ancestor's overflow (a row in a scrolling list, a card, a modal body) —
// see src/components/shared/SplitButton, which now renders the menu in a
// document.body portal specifically so this can't happen. This spec proves
// it for every real page that uses SplitButton, at a short viewport that
// would force the old in-flow dropdown to run off-screen.

async function dismissOnboarding(page: Page) {
  const heading = page.locator('h2:has-text("Welcome,")');
  for (let i = 0; i < 4; i++) {
    if (!(await heading.isVisible({ timeout: 800 }).catch(() => false))) return;
    const btn = page.locator('button:has-text("Save"), button:has-text("Finish")').first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) await btn.click();
    await page.waitForTimeout(500);
  }
}

async function loginAs(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  await page.waitForTimeout(800);
  await dismissOnboarding(page);
}

// Opens every SplitButton's secondary (chevron) trigger on the current page,
// one at a time, and asserts the resulting menu is fully inside the viewport.
async function assertNoSplitButtonClipsOnThisPage(page: Page, label: string) {
  const wrapperCount = await page.locator('[class*="buttonWrapper"]').count();
  for (let i = 0; i < wrapperCount; i++) {
    const wrapper = page.locator('[class*="buttonWrapper"]').nth(i);
    const chevron = wrapper.locator("button").nth(1);
    if (!(await chevron.isVisible().catch(() => false))) continue;

    await chevron.click({ force: true });
    const dropdown = page.getByTestId("split-button-dropdown");
    const opened = await dropdown.isVisible({ timeout: 1000 }).catch(() => false);
    if (!opened) continue; // some wrappers have no secondary options

    const box = await dropdown.boundingBox();
    const viewport = page.viewportSize();
    expect(box, `${label} split-button #${i}: dropdown has no bounding box`).not.toBeNull();
    if (box && viewport) {
      expect(box.y, `${label} split-button #${i}: dropdown top is above the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        `${label} split-button #${i}: dropdown bottom (${box.y + box.height}) runs past the viewport (${viewport.height})`,
      ).toBeLessThanOrEqual(viewport.height);
      expect(box.x, `${label} split-button #${i}: dropdown left is off the left edge`).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${label} split-button #${i}: dropdown right (${box.x + box.width}) runs past the viewport (${viewport.width})`,
      ).toBeLessThanOrEqual(viewport.width);
    }
    // close it before moving to the next wrapper
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(5, 5).catch(() => {});
    await page.waitForTimeout(150);
  }
}

test.describe.configure({ mode: "serial" });

// A short viewport is the whole point: it forces every dropdown near the
// bottom of a list to either flip upward correctly or, pre-fix, clip.
test.use({ viewport: { width: 1280, height: 500 } });

let staffId: string;
let agencyId: string;

test.beforeAll(() => {
  const row = dbQuery<{ id: string }>(`select id from public.agencies where name = 'Clarity Collective' limit 1;`)
    .rows[0];
  agencyId = row.id;
  staffId = createAuthUser({
    email: `smissah321+${TAG}-staff@gmail.com`,
    password: "TestPass123!",
    meta: { role: "admin", first_name: "SB", last_name: "Check" },
  });
  dbQuery(`
    insert into public.agency_members (agency_id, user_id, role, status, employment_type, counselling_enabled)
    values ('${agencyId}', '${staffId}', 'counsellor', 'active', 'employee', true);
  `);
});

test.afterAll(() => {
  dbQuery(`delete from public.agency_members where user_id = '${staffId}';`);
  dbQuery(`delete from public.users where id = '${staffId}';`);
  dbQuery(`delete from auth.users where id = '${staffId}';`);
});

test("admin clients list: no SplitButton dropdown clips at a short viewport", async ({ page }) => {
  await loginAs(page, "demo-admin@honest.com", "DemoAdmin2026");
  await page.goto(`${BASE}/admin/clients`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await assertNoSplitButtonClipsOnThisPage(page, "/admin/clients");
});

test("admin finances (invoices tab): no SplitButton dropdown clips", async ({ page }) => {
  await loginAs(page, "demo-admin@honest.com", "DemoAdmin2026");
  await page.goto(`${BASE}/admin/finances?view=invoices`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await assertNoSplitButtonClipsOnThisPage(page, "/admin/finances?view=invoices");
});

test("agency members list: no SplitButton dropdown clips", async ({ page }) => {
  await loginAs(page, "demo-agency@honest.com", "DemoAgency2026");
  await page.goto(`${BASE}/agency/members`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await assertNoSplitButtonClipsOnThisPage(page, "/agency/members");
});
