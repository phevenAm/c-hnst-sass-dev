// End-to-end coverage for auto_cancel_unpaid_sessions() and the restore flow,
// run against the real (linked) database — no mocking.
//
// The bug this exists to prevent: auto-cancel was pulling unpaid sessions up
// to payment_deadline_hours (48h) BEFORE they were due, and re-cancelling
// every manual restore on the next hourly tick. The corrected rule:
//   * only when practice_settings.auto_cancel_enabled = true, and
//   * only once the session has actually ended (scheduled_at + duration < now).
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let originalAutoCancel = false;
let originalSubStatus = "active";
const created: string[] = [];

function mkSession(opts: { startsSqlExpr: string; durationMin?: number; paid?: boolean; status?: string }): string {
  const id = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid, manual_payment_status)
     values ('${clientId}', '${adminId}', ${opts.startsSqlExpr}, ${opts.durationMin ?? 50},
             '${opts.status ?? "scheduled"}', 'remote', 5000, ${opts.paid ?? false}, 'none')
     returning id;`,
  ).rows[0].id;
  created.push(id);
  return id;
}

const runAutoCancel = () => dbQuery(`select public.auto_cancel_unpaid_sessions();`);
const status = (id: string) =>
  dbQuery<{ status: string }>(`select status from public.sessions where id = '${id}';`).rows[0].status;
const manualPay = (id: string) =>
  dbQuery<{ v: string | null }>(`select manual_payment_status as v from public.sessions where id = '${id}';`).rows[0].v;
const setAutoCancel = (on: boolean) =>
  dbQuery(`update public.practice_settings set auto_cancel_enabled = ${on} where admin_id = '${adminId}';`);

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  clientId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.client.email}';`).rows[0].id;
  dbQuery(`update public.users set admin_id = '${adminId}' where id = '${clientId}';`);
  const ps = dbQuery<{ ac: boolean; sub: string }>(
    `select auto_cancel_enabled as ac, subscription_status as sub from public.practice_settings where admin_id = '${adminId}';`,
  ).rows[0];
  originalAutoCancel = ps.ac;
  originalSubStatus = ps.sub;
  // Clear the SubscriptionGate so the UI test can reach /admin/clients.
  dbQuery(`update public.practice_settings set subscription_status = 'active' where admin_id = '${adminId}';`);
  // Start from a clean slate — a stray session from a previous run trips the
  // practice-wide overlap trigger on our inserts.
  dbQuery(`delete from public.sessions where created_by = '${adminId}';`);
});

test.afterEach(() => {
  if (created.length) {
    dbQuery(`delete from public.sessions where id in (${created.map((i) => `'${i}'`).join(",")});`);
    created.length = 0;
  }
});

test.afterAll(() => {
  dbQuery(
    `update public.practice_settings
       set auto_cancel_enabled = ${originalAutoCancel},
           subscription_status = '${originalSubStatus}'
     where admin_id = '${adminId}';`,
  );
  dbQuery(`delete from public.email_logs where client_id = '${clientId}';`);
  dbQuery(`delete from public.sessions where client_id = '${clientId}';`);
});

test("opted in: cancels only unpaid sessions that have already ended", () => {
  setAutoCancel(true);
  // staggered so the practice-wide overlap trigger doesn't reject the inserts
  const endedUnpaid = mkSession({ startsSqlExpr: "now() - interval '5 hours'" });
  const futureUnpaid = mkSession({ startsSqlExpr: "now() + interval '2 days'" });
  const endedPaid = mkSession({ startsSqlExpr: "now() - interval '3 hours'", paid: true });
  const inProgress = mkSession({ startsSqlExpr: "now() - interval '20 minutes'", durationMin: 50 });

  runAutoCancel();

  expect(status(endedUnpaid), "ended + unpaid → cancelled").toBe("cancelled");
  expect(manualPay(endedUnpaid), "manual_payment_status reset on cancel").toBe("none");
  expect(status(futureUnpaid), "future session must never be auto-cancelled").toBe("scheduled");
  expect(status(endedPaid), "paid session is left alone").toBe("scheduled");
  expect(status(inProgress), "session still running is left alone").toBe("scheduled");
});

test("not opted in: never cancels, even a long-ended unpaid session", () => {
  setAutoCancel(false);
  const endedLongAgo = mkSession({ startsSqlExpr: "now() - interval '3 days'" });

  runAutoCancel();

  expect(status(endedLongAgo)).toBe("scheduled");
});

test("a restored future session survives the next auto-cancel run", () => {
  setAutoCancel(true);
  const s = mkSession({ startsSqlExpr: "now() + interval '2 days'" });
  // simulate the admin cancelling then restoring it
  dbQuery(`update public.sessions set status = 'cancelled' where id = '${s}';`);
  dbQuery(`update public.sessions set status = 'scheduled' where id = '${s}';`);

  runAutoCancel();

  expect(status(s), "auto-cancel must not undo a manual restore of a future session").toBe("scheduled");
});

test("UI: admin restores a cancelled future session and it sticks across a cron run", async ({ page }) => {
  test.setTimeout(90_000);
  setAutoCancel(true);
  const s = mkSession({ startsSqlExpr: "now() + interval '5 days'", status: "cancelled" });

  await page.setViewportSize({ width: 1400, height: 900 });
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });

  // The cancelled future session shows on the Upcoming tab (default) with a
  // "Cancelled" pill; the admin card exposes a Restore action.
  await expect(page.getByText("Cancelled").first()).toBeVisible({ timeout: 20_000 });
  const restore = page.getByRole("button", { name: /^Restore$/ });
  await restore.first().waitFor({ timeout: 15_000 });
  await restore.first().click();

  await expect.poll(() => status(s), { timeout: 15_000, message: "restore writes status=scheduled" }).toBe("scheduled");

  // an hour passes → cron runs again → the restored future session must remain
  runAutoCancel();
  expect(status(s), "restored future session still scheduled after auto-cancel").toBe("scheduled");
});
