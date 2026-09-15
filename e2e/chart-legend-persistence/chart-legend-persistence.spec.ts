// End-to-end coverage for the toggleable trend-chart legend added to the
// Admin Dashboard's Practice Trends widget and the Finance page's Overview
// chart: clicking a legend item's eye icon hides that series, and — the
// actual point of this spec — the choice survives a full page reload
// because it's persisted to practice_settings.hidden_chart_series rather
// than plain component state. A first pass silently didn't persist at all
// (Postgrest's query builder is a lazy thenable; a bare `.update(...)` with
// no `.then()`/await builds the request but never sends it) — this is the
// regression test for that.
//
// Also covers the Finance page's "hide the whole thing, not just the
// chart" behaviour: toggling Income off there hides the Income stat tile,
// hides Net (needs both Income and Outgoings), and drops Income's slice
// from the donut instead of those staying stuck regardless of the toggle.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery, lookupFixtureIds } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let sessionId = "";
let expenseId = "";

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.beforeAll(() => {
  ({ adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email));

  // Known-clean starting point — a leftover hidden series from a previous
  // (possibly failed) run would make this run's "was it hidden before I
  // touched it" assumptions wrong.
  dbQuery(`update public.practice_settings set hidden_chart_series = '{}'::jsonb where admin_id = '${adminId}';`);

  sessionId = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid, paid_at)
     values ('${clientId}', '${adminId}', now() - interval '2 weeks', 50, 'completed', 'in_person', 6000, true, now() - interval '2 weeks')
     returning id;`,
  ).rows[0].id;
  expenseId = dbQuery<{ id: string }>(
    `insert into public.expenses (admin_id, incurred_on, category, amount_pence, description)
     values ('${adminId}', (now() - interval '1 week')::date, 'Supplies', 1200, 'e2e chart-legend-persistence')
     returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  dbQuery(`delete from public.sessions where id = '${sessionId}';`);
  dbQuery(`delete from public.expenses where id = '${expenseId}';`);
  dbQuery(`update public.practice_settings set hidden_chart_series = '{}'::jsonb where admin_id = '${adminId}';`);
});

test("Practice Trends: hiding a series via the legend persists across a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("text=Practice trends", { timeout: 20_000 });

  const outgoingsToggle = page.getByRole("button", { name: "Outgoings" });
  await expect(outgoingsToggle).toBeVisible({ timeout: 15_000 });
  await expect(outgoingsToggle).toHaveAttribute("aria-pressed", "true");

  await outgoingsToggle.click();
  await expect(outgoingsToggle).toHaveAttribute("aria-pressed", "false");

  // The actual regression: confirm the write landed in the DB, not just in
  // React state, before trusting a reload to prove anything.
  await expect
    .poll(
      () =>
        dbQuery<{ hidden: unknown }>(
          `select hidden_chart_series->'practiceTrends' as hidden from public.practice_settings where admin_id = '${adminId}';`,
        ).rows[0].hidden,
      { timeout: 10_000 },
    )
    .toEqual(["Outgoings"]);

  await page.reload({ waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("text=Practice trends", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Outgoings" })).toHaveAttribute("aria-pressed", "false", {
    timeout: 15_000,
  });
  // The right-hand "Sessions" axis is the tell that the chart actually
  // recalculated around the hidden series, not just that the legend button
  // remembered its own state.
  await expect(page.getByRole("button", { name: "Revenue" })).toHaveAttribute("aria-pressed", "true");
});

test("Finance Overview: hiding Income also hides its stat tile, Net, and the donut slice", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/finances`, { waitUntil: "load", timeout: 20_000 });
  await page.getByRole("button", { name: "Overview" }).click();
  await page.waitForSelector("text=Income & outgoings", { timeout: 20_000 });

  // "Income"/"Net" as plain text collide with the Overview/Income/Invoices/
  // Expenses view tab and the "Series shown" chip, which both stay in the
  // DOM regardless of the toggle — each StatTile's `sub` caption is unique
  // to it, so that's what actually identifies the tile appearing/disappearing.
  await expect(page.getByText("Payments received")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Income minus outgoings")).toBeVisible();

  // The chip has aria-pressed; the same-named view tab doesn't — that's
  // what scopes this to the "Series shown" toggle specifically.
  const incomeChip = page.locator("button[aria-pressed]").filter({ hasText: "Income" });
  await incomeChip.click();

  await expect(page.getByText("Payments received")).toHaveCount(0);
  await expect(page.getByText("Income minus outgoings")).toHaveCount(0);
  // Outgoings' own tile is untouched by hiding Income.
  await expect(page.getByText("Expenses recorded")).toBeVisible();

  await expect
    .poll(
      () =>
        dbQuery<{ hidden: unknown }>(
          `select hidden_chart_series->'financeOverview' as hidden from public.practice_settings where admin_id = '${adminId}';`,
        ).rows[0].hidden,
      { timeout: 10_000 },
    )
    .toEqual(["Income"]);

  await page.reload({ waitUntil: "load", timeout: 20_000 });
  await page.getByRole("button", { name: "Overview" }).click();
  await page.waitForSelector("text=Income & outgoings", { timeout: 20_000 });
  await expect(page.getByText("Payments received")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Income minus outgoings")).toHaveCount(0);
});
