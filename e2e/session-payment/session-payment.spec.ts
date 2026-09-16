// End-to-end coverage for: a session the admin books for a client shows up on
// the client's calendar as unpaid, and once the admin marks it paid the client
// sees it as paid too.
//
// The session is inserted via dbQuery (driving the CreateSessionModal's MUI
// date/time pickers in Playwright is brittle and not what's under test). The
// two things under test — the client seeing it, and the mark-as-paid round
// trip — go through the real UI.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";

import { APP_URL, FIXTURES } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let sessionId = "";
const PRICE_PENCE = 5500; // £55

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

  sessionId = dbQuery<{ id: string }>(
    `insert into public.sessions
       (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', now() + interval '3 days', 50, 'scheduled', 'in_person', ${PRICE_PENCE}, false)
     returning id;`,
  ).rows[0].id;
});

test.afterAll(() => {
  // No public.payments row to clean up here — this spec marks sessions
  // paid by flipping sessions.paid directly (never through AddPaymentModal,
  // the only path that inserts into payments), and payments has no
  // session_id column to begin with. A stray `delete ... where session_id`
  // here used to throw on every run and abort before the sessions delete
  // below ever ran, leaving a stale session that broke the next run's
  // overlap check — see the ledger/stub test's cleanup for the same fix.
  dbQuery(`delete from public.sessions where id = '${sessionId}';`);
});

test("the client sees the booked session on /my-sessions, unpaid", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, FIXTURES.client.email, FIXTURES.client.password);
  await page.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20_000 });

  // /my-sessions defaults to the Calendar view (ClientSchedule reads
  // localStorage "clientSessionsView", which a fresh browser context has
  // never set) — the List view is what this test actually checks.
  await page.getByRole("button", { name: "List" }).click();

  // The client-facing card (NextSessionCard) never renders the price as
  // text — only a Paid/Unpaid badge — so this checks that badge, not a
  // "£55" string that doesn't exist anywhere in this component.
  await expect(page.getByText("Unpaid", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
});

test("admin marks it paid; the client then sees it as paid", async ({ page, browser }) => {
  test.setTimeout(120_000);

  // wide enough that SessionCard shows its inline desktop action row
  await page.setViewportSize({ width: 1400, height: 900 });

  // ── admin marks the session paid from the client's detail page ──
  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/clients/${clientId}`, { waitUntil: "load", timeout: 20_000 });
  // Upcoming tab is the default; the session (now + 3d) is there with an inline
  // SessionCard. The admin "Mark as paid" button (data-action-type="payment")
  // now opens a confirm step with an "email the client" checkbox instead of
  // dispatching updateSession directly — the toast-with-a-button pattern this
  // used to assert was dropped in favour of a checkbox-before-confirming.
  // SessionCard's own price indicator is a "£" status pill
  // (title="Payment pending"/"Paid"), not price text, so this waits on the
  // actual button rather than a "£55" string that was never in this
  // component's DOM.
  const markAsPaidButton = page
    .locator('button[data-action-type="payment"]')
    .filter({ hasText: "Mark as paid" })
    .first();
  await expect(markAsPaidButton).toBeVisible({ timeout: 15_000 });
  await markAsPaidButton.click();

  // The FIXTURES client has a real email, so the confirm modal offers the
  // notify checkbox, checked by default — confirming with it checked both
  // marks the session paid AND fires the confirmation email in one step.
  await expect(page.getByText("Mark this session as paid?")).toBeVisible({ timeout: 10_000 });
  const notifyCheckbox = page.getByRole("checkbox", { name: /email the client/i });
  await expect(notifyCheckbox).toBeChecked();
  await page.getByRole("button", { name: "Yes, mark paid" }).click();
  await expect(page.getByText("Marked as paid — confirmation email sent.")).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      () => dbQuery<{ paid: boolean }>(`select paid from public.sessions where id = '${sessionId}';`).rows[0].paid,
      { timeout: 15_000 },
    )
    .toBe(true);

  // ── client reloads and sees "Paid" ──
  const client = await browser.newPage();
  await login(client, FIXTURES.client.email, FIXTURES.client.password);
  await client.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20_000 });
  await expect(client.getByText(/^Paid$/).first()).toBeVisible({ timeout: 15_000 });
  await client.close();
});

test("the payments ledger's 'Mark paid' and a stub session's 'Mark as paid' both offer the same email action", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1400, height: 900 });

  // Every insert below happens inside try, and cleanup only deletes ids it
  // actually got back — a failure partway through setup (e.g. the overlap
  // trigger rejecting one insert) used to leave whatever had already been
  // created with no cleanup at all, which then broke every later run with a
  // stale overlap of its own. One stub, one stub session, one real session,
  // sharing a single offset so cleanup can't partially miss one.
  let ledgerSessionId: string | undefined;
  let stubId: string | undefined;
  let stubSessionId: string | undefined;

  try {
    ledgerSessionId = dbQuery<{ id: string }>(
      `insert into public.sessions
         (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
       values ('${clientId}', '${adminId}', now() + interval '5 days', 50, 'scheduled', 'in_person', ${PRICE_PENCE}, false)
       returning id;`,
    ).rows[0].id;

    stubId = dbQuery<{ id: string }>(
      `insert into public.client_stubs (created_by, first_name, last_name, email)
       values ('${adminId}', 'E2E', 'Stub', 'smissah321+e2e-payment-stub@gmail.com')
       returning id;`,
    ).rows[0].id;
    stubSessionId = dbQuery<{ id: string }>(
      `insert into public.stub_sessions
         (stub_id, admin_id, scheduled_at, duration_minutes, status, location, price_pence, paid)
       values ('${stubId}', '${adminId}', now() + interval '6 days', 50, 'scheduled', 'in_person', ${PRICE_PENCE}, false)
       returning id;`,
    ).rows[0].id;

    await login(page, FIXTURES.admin.email, FIXTURES.admin.password);

    // ── ledger row "Mark paid" (AdminPaymentsPage.handleConfirmMarkPaid) ──
    // Both this and the stub flow below now go through a confirm modal with
    // an "email the client" checkbox instead of a toast-with-a-button.
    await page.goto(`${APP_URL}/admin/finances?view=income`, { waitUntil: "load", timeout: 20_000 });
    const ledgerRow = page.locator("tr").filter({ hasText: "£55.00" }).filter({ hasText: "Mark paid" });
    await expect(ledgerRow).toBeVisible({ timeout: 15_000 });
    await ledgerRow.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText("Mark this session as paid?")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("checkbox", { name: /email the client/i })).toBeChecked();
    await page.getByRole("button", { name: "Yes, mark paid" }).click();
    await expect(page.getByText("Session marked as paid.")).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(
        () =>
          dbQuery<{ paid: boolean }>(`select paid from public.sessions where id = '${ledgerSessionId}';`).rows[0].paid,
        { timeout: 15_000 },
      )
      .toBe(true);

    // ── stub session "Mark as paid" (StubSessionCard.handleConfirmMarkPaid) ──
    await page.goto(`${APP_URL}/admin/clients/stub/${stubId}`, { waitUntil: "load", timeout: 20_000 });
    await page.getByRole("button", { name: "Mark as paid" }).first().click();
    await expect(page.getByText("Mark this session as paid?")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("checkbox", { name: /email the client/i })).toBeChecked();
    await page.getByRole("button", { name: "Yes, mark paid" }).click();
    await expect(page.getByText("Marked as paid — confirmation email sent.")).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(
        () =>
          dbQuery<{ paid: boolean }>(`select paid from public.stub_sessions where id = '${stubSessionId}';`).rows[0]
            .paid,
        { timeout: 15_000 },
      )
      .toBe(true);
  } finally {
    // No public.payments row here either — see the afterAll comment above.
    // Only delete ids that were actually created, so a failure partway
    // through setup doesn't throw again here (which would itself have
    // swallowed the original error) and doesn't skip the cleanup that
    // setup step actually needs.
    if (stubSessionId) dbQuery(`delete from public.stub_sessions where id = '${stubSessionId}';`);
    if (stubId) dbQuery(`delete from public.client_stubs where id = '${stubId}';`);
    if (ledgerSessionId) dbQuery(`delete from public.sessions where id = '${ledgerSessionId}';`);
  }
});
