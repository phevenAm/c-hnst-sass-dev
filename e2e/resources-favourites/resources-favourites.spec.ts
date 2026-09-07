// End-to-end coverage for the client Resources page — favouriting and the
// pinned-to-top ordering, neither of which has an e2e today (only unit tests
// on the slice + page).
//
//   1. A pinned resource sorts above an unpinned one in the same tab.
//   2. Tapping the star favourites a resource; it then shows in the
//      "Favourites" tab and the state survives a reload (row in
//      resource_favourites).
//   3. Un-starring removes it from the Favourites tab again.
//
// Seeds two throwaway resources for the fixture admin (visible to the fixture
// client via the "clients view published resources" RLS policy) and deletes
// them + any resulting favourite rows in afterAll, on every exit path.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TS = Date.now();
const PINNED_TITLE = `E2E Pinned Resource ${TS}`;
const PLAIN_TITLE = `E2E Plain Resource ${TS}`;

let adminId = "";
let clientId = "";
let pinnedId = "";
let plainId = "";

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  clientId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.client.email}';`).rows[0].id;

  // Two published articles for this practice: one pinned, one not. Timestamps
  // are set so the *plain* one is newer — the page orders by updated_at desc,
  // so without the pin the plain one would come first; the pin has to override.
  const rows = dbQuery<{ id: string; title: string }>(`
    insert into public.resources (admin_id, title, summary, type, category, is_published, is_pinned, updated_at)
    values
      ('${adminId}', '${PINNED_TITLE}', 'Pinned summary', 'article', 'General', true, true,  now() - interval '1 hour'),
      ('${adminId}', '${PLAIN_TITLE}',  'Plain summary',  'article', 'General', true, false, now())
    returning id, title;
  `).rows;
  pinnedId = rows.find((r) => r.title === PINNED_TITLE)?.id ?? "";
  plainId = rows.find((r) => r.title === PLAIN_TITLE)?.id ?? "";
  if (!pinnedId || !plainId) throw new Error("resource seed failed");
});

test.afterAll(() => {
  // resource_favourites has ON DELETE CASCADE from resources, but be explicit
  // in case the resource insert half-failed and left a stray favourite.
  if (clientId) {
    dbQuery(
      `delete from public.resource_favourites where user_id = '${clientId}' and resource_id in ('${pinnedId}', '${plainId}');`,
    );
  }
  dbQuery(`delete from public.resources where id in ('${pinnedId}', '${plainId}');`);
});

async function loginAsClient(page: Page) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', FIXTURES.client.email);
  await page.fill('input[type="password"]', FIXTURES.client.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await page.goto(`${APP_URL}/resources`, { waitUntil: "load", timeout: 20_000 });
}

// A resource card is the nearest common ancestor of its title text and its
// favourite button — walk up to the element that contains both.
const cardFor = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).locator("xpath=ancestor::*[.//button[@aria-pressed]][1]");

test("the pinned resource sorts above the newer unpinned one", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAsClient(page);

  await expect(page.getByText(PINNED_TITLE, { exact: true })).toBeVisible();
  await expect(page.getByText(PLAIN_TITLE, { exact: true })).toBeVisible();

  // Assert DOM order, not pixel Y — the grid may lay both cards on one row.
  // The page orders by updated_at desc (plain is newer) then floats pinned
  // to the top, so pinned must come first despite being the older row.
  const titles = await page.locator('[class*="cardTitle"]').allInnerTexts();
  const pinnedIdx = titles.indexOf(PINNED_TITLE);
  const plainIdx = titles.indexOf(PLAIN_TITLE);
  expect(pinnedIdx).toBeGreaterThanOrEqual(0);
  expect(plainIdx).toBeGreaterThanOrEqual(0);
  expect(pinnedIdx, "pinned resource should come before the plain one").toBeLessThan(plainIdx);
});

test("starring a resource adds it to the Favourites tab and persists across reload", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsClient(page);

  const star = cardFor(page, PLAIN_TITLE).getByRole("button", { name: "Add to favourites" });
  await star.click();
  await expect(cardFor(page, PLAIN_TITLE).getByRole("button", { name: "Remove from favourites" })).toBeVisible();

  // It's written to the DB…
  await expect
    .poll(
      () =>
        dbQuery<{ n: string }>(
          `select count(*)::text as n from public.resource_favourites where user_id = '${clientId}' and resource_id = '${plainId}';`,
        ).rows[0].n,
      { timeout: 10_000 },
    )
    .toBe("1");

  // …shows under the Favourites tab…
  await page.getByRole("tab", { name: "Favourites" }).click();
  await expect(page.getByText(PLAIN_TITLE, { exact: true })).toBeVisible();
  await expect(page.getByText(PINNED_TITLE, { exact: true })).toHaveCount(0);

  // …and is still favourited after a full reload.
  await page.reload({ waitUntil: "load", timeout: 20_000 });
  await page.getByRole("tab", { name: "Favourites" }).click();
  await expect(page.getByText(PLAIN_TITLE, { exact: true })).toBeVisible();
});

test("un-starring removes it from the Favourites tab", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsClient(page);

  // From the previous test the plain resource is favourited. Remove it.
  const unstar = cardFor(page, PLAIN_TITLE).getByRole("button", { name: "Remove from favourites" });
  await unstar.click();
  await expect(cardFor(page, PLAIN_TITLE).getByRole("button", { name: "Add to favourites" })).toBeVisible();

  await expect
    .poll(
      () =>
        dbQuery<{ n: string }>(
          `select count(*)::text as n from public.resource_favourites where user_id = '${clientId}' and resource_id = '${plainId}';`,
        ).rows[0].n,
      { timeout: 10_000 },
    )
    .toBe("0");

  await page.getByRole("tab", { name: "Favourites" }).click();
  await expect(page.getByText(PLAIN_TITLE, { exact: true })).toHaveCount(0);
});
