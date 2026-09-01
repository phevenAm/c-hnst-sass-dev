// Real integration test for the reminder in-app notification: seed an unpaid
// session in the fixture practice's reminder window, fire the actual cron
// (via the SQL wrapper that reads the internal secret from Vault), and assert
// BOTH an email_logs 'sent' row AND a notifications row land for the client.
//
// Safe to invoke the global sweep here because there are no real customers —
// the only sessions in the 5-day window are the ones this test creates.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, test } from "@playwright/test";

import { FIXTURES } from "../settings/constants";
import { dbQuery, insertSessions, lookupFixtureIds } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let sessionId = "";

test.beforeAll(() => {
  ({ adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email));

  // reminder_hours_before defaults to 120 (5 days); ±12h window. Put the
  // session dead-centre, unpaid, and clear any stale reminder state.
  dbQuery(`delete from public.email_logs where client_id = '${clientId}' and email_type = 'session_reminder';`);
  dbQuery(
    `delete from public.notifications where user_id = '${clientId}' and type in ('session_reminder', 'session_payment_due');`,
  );

  sessionId = insertSessions([
    {
      label: "reminder",
      clientId,
      adminId,
      scheduledAt: new Date(Date.now() + 120 * 3_600_000).toISOString(),
      paid: false,
    },
  ]).reminder;
});

test.afterAll(() => {
  dbQuery(`delete from public.email_logs where session_id = '${sessionId}';`);
  dbQuery(
    `delete from public.notifications where user_id = '${clientId}' and type in ('session_reminder', 'session_payment_due');`,
  );
  dbQuery(`delete from public.sessions where id = '${sessionId}';`);
});

test("firing the reminder cron logs a sent email AND drops an in-app notification for the client", async () => {
  test.setTimeout(90_000);

  // trigger_client_session_reminders() net.http_post's the edge function with
  // the Vault secret — fire-and-forget, so poll for the results.
  dbQuery(`select public.trigger_client_session_reminders();`);

  await expect
    .poll(
      () =>
        dbQuery<{ status: string }>(
          `select status from public.email_logs
            where session_id = '${sessionId}' and email_type = 'session_reminder'
            order by created_at desc limit 1;`,
        ).rows[0]?.status ?? null,
      { timeout: 45_000, intervals: [2000] },
    )
    .toBe("sent");

  const notif = dbQuery<{ type: string; message: string; url: string | null }>(
    `select type, message, url from public.notifications
      where user_id = '${clientId}' and type in ('session_reminder', 'session_payment_due')
      order by created_at desc limit 1;`,
  ).rows[0];

  expect(notif).toBeTruthy();
  expect(notif.type).toBe("session_payment_due"); // unpaid session
  expect(notif.message).toMatch(/not paid yet/i);
  expect(notif.url ?? "").toMatch(/\/my-sessions$/);
});
