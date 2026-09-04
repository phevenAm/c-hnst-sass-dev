// Browser-driven coverage for the two flows account-lifecycle.spec.ts only
// exercises at the API level: the Pause/Resume button in Settings -> Billing,
// and the DeleteUserModal walkthrough (export -> type-to-confirm -> delete).
// This is what closes the "no UI click-through" gap noted on /dev.
//
// video: "on" is set in playwright.config.ts — these tests actually use the
// `page` fixture, so a real recording lands in test-results/ for each one
// (see the run's HTML report, `npx playwright show-report`, for playback).
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

async function loginAsAdmin(page: import("@playwright/test").Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test("admin pauses and resumes the practice from Settings -> Billing (UI, happy path)", async ({ page }) => {
  test.setTimeout(120_000);
  const adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0]
    .id;
  dbQuery(`update public.practice_settings set is_paused = false, paused_at = null where admin_id = '${adminId}';`);

  try {
    await loginAsAdmin(page, FIXTURES.admin.email, FIXTURES.admin.password);
    await page.goto(`${APP_URL}/settings`, { waitUntil: "load", timeout: 20_000 });
    await page.getByRole("button", { name: "Billing" }).click();

    await page.getByRole("button", { name: "Pause practice" }).click();
    const pauseDialog = page.getByRole("dialog");
    await expect(pauseDialog).toBeVisible({ timeout: 10_000 });
    await pauseDialog.getByRole("button", { name: "Pause practice" }).click();

    // Distinct from the "Your practice is now paused." toast, which also matches /Your practice is/.
    await expect(page.getByText(/It's read-only for you/)).toBeVisible({ timeout: 20_000 });
    // The app-wide read-only banner should also show up once the practice
    // cache refreshes.
    await expect(page.getByText(/This practice is paused/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Resume practice" }).click();
    const resumeDialog = page.getByRole("dialog");
    await expect(resumeDialog).toBeVisible({ timeout: 10_000 });
    await resumeDialog.getByRole("button", { name: "Resume practice" }).click();

    await expect(page.getByText(/This practice is paused/i)).toHaveCount(0, { timeout: 20_000 });
  } finally {
    // Never leave the shared fixture practice paused for other specs.
    dbQuery(`update public.practice_settings set is_paused = false, paused_at = null where admin_id = '${adminId}';`);
  }
});

test("a fresh admin deletes their own account through the real UI, start to finish (UI, happy path)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = `e2e-ui-delete-${Date.now()}@clarity-e2e-test.dev`;
  const password = "E2eUiDelete2026!";
  const practiceName = "UI Delete Test Practice";
  const uid = createAuthUser({ email, password, meta: { role: "admin", practice_name: practiceName } });

  try {
    // Skip the parts of onboarding this test isn't about (Router gates
    // /settings behind an active subscription + completed setup, and
    // OnboardingModal — see Router.tsx's `eligible` check — pops up for ANY
    // user, admin included, whose users.onboarding_completed is still false).
    dbQuery(
      `update public.practice_settings set subscription_status = 'active', onboarding_required = false where admin_id = '${uid}';
       update public.users set onboarding_completed = true where id = '${uid}';`,
    );

    await loginAsAdmin(page, email, password);
    await page.goto(`${APP_URL}/settings`, { waitUntil: "load", timeout: 20_000 });
    await page.getByRole("button", { name: "Billing" }).click();

    await page.getByRole("button", { name: "Delete account" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText(/permanent and immediate/i)).toBeVisible({ timeout: 10_000 });
    await modal.getByRole("button", { name: "continue to delete confirmation" }).click();

    await modal.getByRole("button", { name: "Export my data" }).click();
    await expect(modal.getByText(/Downloaded clarity-export-.*\.zip/)).toBeVisible({ timeout: 20_000 });

    const deleteBtn = modal.getByRole("button", { name: "confirm user deletion" });
    await expect(deleteBtn).toBeDisabled();
    await modal.getByLabel(/type/i).fill(practiceName);
    await expect(deleteBtn).toBeEnabled();

    await deleteBtn.click();
    await page.waitForURL((u) => u.pathname.includes("/login"), { timeout: 20_000 });

    const left = dbQuery<{ n: number }>(`select count(*)::int as n from public.users where id = '${uid}';`).rows[0].n;
    expect(left).toBe(0);
  } finally {
    // No-ops if the UI flow already deleted them; safety net if it didn't.
    dbQuery(`delete from public.practice_settings where admin_id = '${uid}';`);
    dbQuery(`delete from auth.users where id = '${uid}';`);
  }
});
