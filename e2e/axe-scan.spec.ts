import { type Page, test } from "@playwright/test";
import { getViolations, injectAxe } from "axe-playwright";

const BASE = "http://localhost:5174";

async function checkA11y(page: Page, label: string) {
  await injectAxe(page);
  const violations = await getViolations(page);
  if (violations.length === 0) return;

  const lines = violations.flatMap((v) => [
    `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`,
    ...v.nodes.map((n) => `  → ${n.target.join(", ")}: ${n.failureSummary?.split("\n")[0] ?? ""}`),
  ]);
  throw new Error(`${violations.length} a11y violation(s) on "${label}":\n\n${lines.join("\n")}`);
}

async function dismissOnboarding(page: Page) {
  try {
    await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
    const saveBtn = page.locator('button:has-text("Save")').first();
    const skipBtn = page.locator('button:has-text("Skip")').first();
    if (await saveBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await saveBtn.click();
    } else if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(600);
  } catch {
    // no onboarding modal
  }
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
  await dismissOnboarding(page);
}

async function openModal(page: Page, triggerText: string) {
  await dismissOnboarding(page);
  await page.click(`button:has-text("${triggerText}")`, { timeout: 4000 });
  await page.waitForTimeout(600);
}

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe("Public pages", () => {
  for (const path of ["/login", "/signup"]) {
    test(path, async ({ page }) => {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await checkA11y(page, path);
    });
  }
});

// ── Admin pages ───────────────────────────────────────────────────────────────

test.describe("Admin pages", () => {
  test.describe.configure({ mode: "serial" });

  let page!: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, "demo-admin@honest.com", "DemoAdmin2026");
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const path of ["/admin", "/admin/clients", "/admin/questionnaires", "/admin/resources", "/admin/scheduler"]) {
    test(path, async () => {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await checkA11y(page, path);
    });
  }

  test("questionnaires — new check-in modal", async () => {
    await page.goto(`${BASE}/admin/questionnaires`, { waitUntil: "networkidle" });
    await openModal(page, "+ New check-in");
    await checkA11y(page, "questionnaires — new check-in modal");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("dashboard — new todo modal", async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await openModal(page, "+ Todo");
    await checkA11y(page, "dashboard — new todo modal");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });
});

// ── Client pages ──────────────────────────────────────────────────────────────

test.describe("Client pages", () => {
  test.describe.configure({ mode: "serial" });

  let page!: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, "demo-client@honest.com", "DemoClient2026");
  });

  test.afterAll(async () => {
    await page.close();
  });

  for (const path of [
    "/dashboard",
    "/forms",
    "check-in",
    "/payments",
    "/admin/resources",
    "/resources",
    "/my-sessions",
    "/settings",
  ]) {
    test(path, async () => {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await checkA11y(page, path);
    });
  }

  test("resources — resource modal", async () => {
    await page.goto(`${BASE}/resources`, { waitUntil: "networkidle" });
    const card = page.locator('button:has-text("Read"), button:has-text("Watch")').first();
    if (!(await card.isVisible({ timeout: 2000 }).catch(() => false))) return;
    await card.click();
    await page.waitForTimeout(500);
    await checkA11y(page, "resources — resource modal");
    await page.keyboard.press("Escape");
  });
});
