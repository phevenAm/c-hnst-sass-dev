// End-to-end coverage for the auth gate itself — the thing every other spec
// leans on but none actually asserts:
//   1. A wrong password is rejected and keeps you on /login.
//   2. ProtectedRoute bounces a signed-in client off an admin route (→ /dashboard)
//      and a signed-in admin off a client route (→ /admin).
//   3. An unauthenticated deep-link to a protected route lands on /login.
//   4. Signing out actually clears the session — the protected route is gated again.
//
// Read-only: it signs in as the shared fixture admin/client but never writes
// anything, so there is nothing to clean up. Runs against the local dev server.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";

test.describe.configure({ mode: "serial" });

async function loginInBrowser(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test("a wrong password is rejected and stays on /login", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });

  await page.fill('input[type="email"]', FIXTURES.client.email);
  await page.fill('input[type="password"]', "definitely-not-the-password");
  await page.click('button[type="submit"]');

  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login$/);
  // The app never navigated away, so no protected content mounted.
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("an unauthenticated deep link to a protected route redirects to /login", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("a signed-in client is bounced off an admin route to /dashboard", async ({ page }) => {
  test.setTimeout(90_000);
  await loginInBrowser(page, FIXTURES.client.email, FIXTURES.client.password);

  await page.goto(`${APP_URL}/admin/clients`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 15_000 });
});

test("a signed-in admin is bounced off a client route to /admin", async ({ page }) => {
  test.setTimeout(90_000);
  await loginInBrowser(page, FIXTURES.admin.email, FIXTURES.admin.password);

  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 15_000 });
});

test("signing out clears the session and re-gates protected routes", async ({ page }) => {
  test.setTimeout(90_000);
  await loginInBrowser(page, FIXTURES.client.email, FIXTURES.client.password);

  // The client Navbar carries a top-level "Sign out" control (aria-label).
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL((u) => u.pathname === "/login" || u.pathname === "/", { timeout: 15_000 });

  // Session is gone — a protected route now redirects back to /login rather
  // than restoring from a lingering token.
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 15_000 });
});
