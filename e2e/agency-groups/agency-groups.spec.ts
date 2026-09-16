// Coverage for the new Groups feature (2026-09-16): agency managers can
// create a group, add an existing client_stub and a staff member to it, see
// it reflected on both the Groups page and the client's own detail page, and
// delete it again. This is the v1 scope only — group SESSION booking and
// calendar rendering are a deliberately separate follow-up (payment model
// still undecided, see memory/project_agency_next_session_plan_20260916.md).
import { expect, test } from "@playwright/test";

import { APP_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

const TAG = `agrp${Date.now()}`;
const PASSWORD = "TmpAgencyGroups2026!";
let agencyId: string;
let ownerId: string;
let stubId: string;

test.beforeAll(() => {
  ownerId = createAuthUser({
    email: `smissah321+${TAG}-owner@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Owner", last_name: TAG },
  });
  agencyId = dbQuery<{ id: string }>(
    `insert into public.agencies (name, owner_id) values ('E2E Groups Agency ${TAG}', '${ownerId}') returning id;`,
  ).rows[0].id;
  dbQuery(`
    insert into public.agency_members (agency_id, user_id, role, employment_type, status, joined_at)
    values ('${agencyId}', '${ownerId}', 'manager', 'employee', 'active', now());
    update public.users set agency_id = '${agencyId}', onboarding_completed = true where id = '${ownerId}';
    update public.practice_settings set subscription_status = 'active', onboarding_required = false
      where admin_id = '${ownerId}';
  `);
  stubId = dbQuery<{ id: string }>(
    `insert into public.client_stubs (created_by, agency_id, first_name, last_name)
     values ('${ownerId}', '${agencyId}', 'Group', 'Client${TAG}') returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  dbQuery(`delete from public.group_members where stub_id = '${stubId}';`);
  dbQuery(`delete from public.groups where agency_id = '${agencyId}';`);
  dbQuery(`delete from public.client_stubs where id = '${stubId}';`);
  dbQuery(`delete from public.agency_members where agency_id = '${agencyId}';`);
  dbQuery(`delete from public.agencies where id = '${agencyId}';`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

test("manager creates a group, adds a client and staff, sees it on the client's page, then deletes it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', `smissah321+${TAG}-owner@gmail.com`);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });

  await page.goto(`${APP_URL}/agency/groups`, { waitUntil: "load", timeout: 20_000 });
  await page.waitForSelector("#boot-splash", { state: "hidden", timeout: 10_000 }).catch(() => {});

  await expect(page.getByText("No groups yet.")).toBeVisible({ timeout: 15_000 });

  const groupName = `E2E Group ${TAG}`;
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByLabel("Group name").fill(groupName);
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByText(groupName)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("0 clients · 0 staff")).toBeVisible();

  // Open the group to add the client and the manager as facilitating staff.
  await page.getByText(groupName).click();
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();

  await page.getByLabel("Add a client to this group").selectOption({ label: `Group Client${TAG}` });
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText(`Group Client${TAG}`)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Add a staff member to this group").selectOption({ label: `Owner ${TAG}` });
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(`Owner ${TAG}`)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("1 client · 1 staff")).toBeVisible({ timeout: 10_000 });

  // The client's own detail page reflects the same membership.
  await page.goto(`${APP_URL}/agency/clients/${stubId}`, { waitUntil: "load", timeout: 20_000 });
  await expect(page.getByText(groupName)).toBeVisible({ timeout: 15_000 });

  // Clean up via the UI too, confirming delete actually removes it.
  await page.goto(`${APP_URL}/agency/groups`, { waitUntil: "load", timeout: 20_000 });
  await page.getByText(groupName).click();
  await page.getByRole("button", { name: "Delete group" }).click();
  await page.getByRole("button", { name: "Yes, delete group" }).click();
  await expect(page.getByText("No groups yet.")).toBeVisible({ timeout: 15_000 });
});
