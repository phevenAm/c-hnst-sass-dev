// Regression coverage for two bugs found together on 2026-09-16:
//
// 1. AgencySessionsPage only ever queried public.sessions — a staff member's
//    offline/stub-client session (public.stub_sessions) never appeared on the
//    agency-wide calendar at all, with no error to explain why. Fixed by also
//    fetching stub_sessions/client_stubs and merging them into one entry list.
//
// 2. AgencyMembersPage's row layout used `.row { justify-content:
//    space-between }` with a bare (non-flex-grow) `.rowMain` — fine when a
//    row has 3 children (avatar/main/actions), but the owner's row has no
//    "Manage" action (self-management link is `[!isOwner(m) && …]`), leaving
//    only 2 children — space-between then shoves the lone `.rowMain` flush
//    against the right edge instead of sitting next to the avatar.
//
// Prereq: none beyond a working local dev server — seeds its own disposable
// agency (owner + one employee counsellor) rather than the shared FIXTURES.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

const TAG = `e2eagsv${Date.now()}`;
const PASSWORD = "E2eAgencySessVis2026!";

let agencyId: string;
let ownerId: string;
let memberId: string;
let stubId: string;
let stubSessionId: string;

test.beforeAll(() => {
  ownerId = createAuthUser({
    email: `smissah321+${TAG}-owner@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Owner", last_name: TAG },
  });
  memberId = createAuthUser({
    email: `smissah321+${TAG}-member@gmail.com`,
    password: PASSWORD,
    meta: { role: "admin", first_name: "Counsellor", last_name: TAG },
  });

  agencyId = dbQuery<{ id: string }>(
    `insert into public.agencies (name, owner_id) values ('E2E Agency ${TAG}', '${ownerId}') returning id;`,
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

  stubId = dbQuery<{ id: string }>(
    `insert into public.client_stubs (created_by, first_name, last_name)
     values ('${memberId}', 'Stub', 'Client${TAG}') returning id;`,
  ).rows[0].id;

  // Scheduled "now" so it's inside AgencySessionsPage's default ±7-day window
  // regardless of what day this runs.
  stubSessionId = dbQuery<{ id: string }>(
    `insert into public.stub_sessions (admin_id, stub_id, scheduled_at, duration_minutes, status)
     values ('${memberId}', '${stubId}', now() + interval '1 hour', 50, 'scheduled') returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  dbQuery(`delete from public.stub_sessions where id = '${stubSessionId}';`);
  dbQuery(`delete from public.client_stubs where id = '${stubId}';`);
  dbQuery(`delete from public.agency_members where agency_id = '${agencyId}';`);
  dbQuery(`delete from public.agencies where id = '${agencyId}';`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}%@gmail.com';`);
});

async function login(page: Page, email: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test("a staff member's offline-client session shows on the agency-wide sessions calendar (regression)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page, `smissah321+${TAG}-owner@gmail.com`);
  await page.goto(`${APP_URL}/agency/sessions`, { waitUntil: "load", timeout: 20_000 });
  await page.getByRole("tab", { name: "List" }).click();

  await expect(page.getByText(new RegExp(`Stub Client${TAG}.*Counsellor ${TAG}`))).toBeVisible({ timeout: 15_000 });
});

test("the owner's row in Members sits left-aligned like every other row, not shoved to the far edge (regression)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await login(page, `smissah321+${TAG}-owner@gmail.com`);
  await page.goto(`${APP_URL}/agency/members`, { waitUntil: "load", timeout: 20_000 });

  const ownerRow = page
    .locator("text=Owner " + TAG)
    .locator("..")
    .locator("..");
  const avatarBox = await ownerRow.locator("img, div").first().boundingBox();
  const nameBox = await page.getByText(`Owner ${TAG}`, { exact: false }).first().boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  // The name block should start within ~80px of the avatar's left edge — a
  // space-between-pushed-right layout would land it hundreds of px further
  // right (near the container's far edge).
  if (avatarBox && nameBox) {
    expect(nameBox.x - avatarBox.x).toBeLessThan(80);
  }
});
