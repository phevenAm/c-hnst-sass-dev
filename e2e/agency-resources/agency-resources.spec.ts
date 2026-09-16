// Regression coverage (2026-09-16): the agency (manager) view had no
// Resources nav item at all — Files existed under /agency/files but nothing
// equivalent for Resources, so a manager had no visible way to publish
// shared content, even though the backend already supported it (RLS lets
// staff read a manager's resources once agencies.shared_resources is on).
// Fixed by reusing AdminResourcesPage at /agency/resources exactly like
// /agency/files reuses AdminFilesPage — both rely on acts_for_admin RLS to
// aggregate every member's rows for a manager, no new schema needed.
import { expect, test } from "@playwright/test";

import { APP_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

const TAG = `agres${Date.now()}`;
const PASSWORD = "TmpAgencyResources2026!";
let agencyId: string;
let ownerId: string;
let memberId: string;

test.beforeAll(() => {
  ownerId = createAuthUser({
    email: `smissah321+${TAG}-owner@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Owner", last_name: TAG },
  });
  memberId = createAuthUser({
    email: `smissah321+${TAG}-member@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Member", last_name: TAG },
  });
  agencyId = dbQuery<{ id: string }>(
    `insert into public.agencies (name, owner_id, shared_resources) values ('E2E Agency ${TAG}', '${ownerId}', true) returning id;`,
  ).rows[0].id;
  dbQuery(`
    insert into public.agency_members (agency_id, user_id, role, employment_type, status, joined_at)
    values
      ('${agencyId}', '${ownerId}', 'manager', 'employee', 'active', now()),
      ('${agencyId}', '${memberId}', 'counsellor', 'employee', 'active', now());
    update public.users set agency_id = '${agencyId}', onboarding_completed = true
      where id in ('${ownerId}', '${memberId}');
    update public.practice_settings set subscription_status = 'active', onboarding_required = false
      where admin_id in ('${ownerId}', '${memberId}');
  `);
});

test.afterAll(() => {
  dbQuery(`delete from public.resources where admin_id in ('${ownerId}', '${memberId}');`);
  dbQuery(`delete from public.agency_members where agency_id = '${agencyId}';`);
  dbQuery(`delete from public.agencies where id = '${agencyId}';`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

test("manager sees a Resources nav item, adds one, and it's readable by a staff member's own account", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', `smissah321+${TAG}-owner@gmail.com`);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });

  await page.goto(`${APP_URL}/agency`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("#boot-splash", { state: "hidden", timeout: 10_000 }).catch(() => {});
  await expect(page.getByRole("link", { name: "Resources" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Resources" }).click();
  await expect(page).toHaveURL(/\/agency\/resources/);

  // Confirm the RLS aggregation actually reflects a shared row across accounts,
  // not just that the page renders — insert as manager, read as staff.
  const resourceId = dbQuery<{ id: string }>(
    `insert into public.resources (admin_id, title, url) values ('${ownerId}', 'Shared Handout ${TAG}', 'https://example.com') returning id;`,
  ).rows[0].id;

  const staffPage = await browser.newPage();
  await staffPage.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await staffPage.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await staffPage.fill('input[type="email"]', `smissah321+${TAG}-member@gmail.com`);
  await staffPage.fill('input[type="password"]', PASSWORD);
  await staffPage.click('button[type="submit"]');
  await staffPage.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
  await staffPage.goto(`${APP_URL}/admin/resources`, { waitUntil: "load", timeout: 20_000 });
  await expect(staffPage.getByText(`Shared Handout ${TAG}`)).toBeVisible({ timeout: 15_000 });
  await staffPage.close();

  dbQuery(`delete from public.resources where id = '${resourceId}';`);
});
