// Real end-to-end coverage for three things fixed together (2026-08-26):
//   1. Assigning a check-in produces exactly ONE notification for the
//      client, and it's clickable through to /check-in.
//   2. Creating a chart tag while building a form actually works (tags.
//      admin_id had no default and the payload never set it, so every
//      insert silently 23502'd).
//   3. Completing a check-in and returning to the dashboard shows the
//      newly-plotted data — this is also the empirical test that drove the
//      fix, since the "stale cache" theory didn't hold up under static
//      reading alone.
//
// Runs against the local dev server, reusing the shared e2e-settings-admin
// fixture (see e2e/settings/seed-fixtures.mjs) rather than creating a new
// one — cleans up everything it creates (questionnaire cascade-deletes its
// questions/assignments/responses; the tag is deleted by name) so repeated
// runs don't accumulate junk on the shared fixture.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

async function loginInBrowser(page: Page, email: string, password: string) {
  await page.addInitScript(() => {
    localStorage.setItem("walkthrough_globally_dismissed", "true");
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
}

const FORM_TITLE = `E2E Weekly Test ${Date.now()}`;
const TAG_NAME = `E2ETag${Date.now()}`;

test.afterAll(() => {
  // Cascade deletes questions/questionnaire_assignments/responses.
  dbQuery(`delete from public.questionnaires where title = '${FORM_TITLE}';`);
  dbQuery(`delete from public.tags where name = '${TAG_NAME}';`);
});

test("assign a check-in with a new tag, complete it, and see it plotted — with exactly one clickable notification", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);

  // ── Admin: create a form, create a new chart tag on it, assign to the client ──
  await loginInBrowser(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/forms`, { waitUntil: "load", timeout: 20000 });

  await page.getByRole("button", { name: "+ New form" }).click();
  await page.locator("#q-title").fill(FORM_TITLE);
  await page.locator("#q-freq").selectOption("weekly");
  await page.getByPlaceholder("Question text…").fill("How are you feeling?");

  // Regression: this used to silently no-op (tags.admin_id had no default,
  // and the insert payload never set it) — "Failed to create tag." would
  // show and the dropdown would stay stuck on "+ Create new tag…" instead
  // of reverting to the newly-created tag.
  await page.getByLabel("Chart tag").selectOption("__new__");
  await page.getByPlaceholder("Tag name (e.g. Sleep)").fill(TAG_NAME);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Failed to create tag.")).not.toBeVisible();
  await expect(page.getByPlaceholder("Tag name (e.g. Sleep)")).not.toBeVisible();
  await expect(page.getByLabel("Chart tag").locator("option", { hasText: TAG_NAME })).toHaveCount(1);

  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByRole("heading", { name: FORM_TITLE })).toBeVisible();

  // CSS-module class names are hashed (e.g. _qCard_1a2b3) — match on the
  // original name as a substring, not a literal class selector.
  const formCard = page.locator('[class*="qCard"]', { hasText: FORM_TITLE });
  await formCard.getByRole("button", { name: "Assign" }).first().click();
  await expect(page.getByRole("heading", { name: "Assign clients" })).toBeVisible();
  await page.locator("li", { hasText: "E2E SettingsClient" }).click();
  await expect(page.locator("li", { hasText: "E2E SettingsClient" })).toContainText("Assigned");
  await page.getByRole("button", { name: "Close modal" }).click();

  // ── Client: exactly one notification, and it's the working link ──
  // A genuinely separate browser context, not just a new page/tab in the
  // admin's context — sharing localStorage between two signed-in users in
  // the same origin runs into supabase-js's cross-tab auth lock and hangs
  // the second sign-in indefinitely (confirmed live: it never resolved).
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await loginInBrowser(clientPage, FIXTURES.client.email, FIXTURES.client.password);
  await clientPage.getByRole("button", { name: "Notifications" }).click();

  const matchingNotifications = clientPage.getByText(`A new check-in has been assigned to you: ${FORM_TITLE}.`);
  await expect(matchingNotifications).toHaveCount(1);
  // The old, now-removed edge-function copy had different wording and no
  // link — confirm it's gone, not just that the new one is also present.
  await expect(clientPage.getByText(`You've been assigned: ${FORM_TITLE}`)).toHaveCount(0);

  await matchingNotifications.click();
  await clientPage.waitForURL((u) => u.pathname === "/check-in", { timeout: 10000 });

  // ── Client: complete the check-in ──
  await expect(clientPage.getByRole("heading", { name: FORM_TITLE })).toBeVisible();
  await clientPage.getByRole("radio", { name: "7", exact: true }).click();
  await clientPage.getByRole("button", { name: "Submit" }).click();
  await expect(clientPage.getByText("Your response has been recorded.")).toBeVisible({ timeout: 10000 });

  // Same navigation a real user takes — not a raw page.goto — since the
  // reported bug was specifically about what the dashboard shows *after*
  // this exact in-app hop from a completed check-in.
  await clientPage.getByRole("button", { name: "View my progress" }).click();
  await clientPage.waitForURL((u) => u.pathname === "/dashboard", { timeout: 10000 });

  // ── Client: dashboard shows the newly-plotted data, not the empty state ──
  await expect(
    clientPage.getByText("No responses yet. Complete your first check-in to see your progress."),
  ).not.toBeVisible();
  await expect(clientPage.getByText("Your Wellbeing Over Time")).toBeVisible();

  await clientContext.close();
});
