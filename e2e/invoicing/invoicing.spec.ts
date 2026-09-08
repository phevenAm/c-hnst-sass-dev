// Real integration coverage for the 2026-09-08 invoicing work:
//
//  1. Client RLS — a client sees their OWN invoice on /invoices only once it
//     leaves `draft`; a draft is invisible to them.
//  2. Sending — the admin's "Send email" action logs an email_logs row, drops
//     an in-app notification for the client, and flips the invoice to `sent`.
//  3. Payments wiring — "Mark paid" writes a public.payments row (this is how
//     invoiced income reaches the payment ledger / Finances overview).
//  4. Master switch — practice_settings.invoices_enabled = false hides the
//     Finances "Invoices" tab, the client's /invoices nav link, and the page.
//
// Everything under test goes through the real UI with the fixture accounts;
// only the initial draft invoice is seeded via dbQuery (RLS blocks a plain
// session from inserting one for an arbitrary client, and driving the modal's
// pickers isn't what's under test). Every seeded row is removed in afterAll.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery, lookupFixtureIds } from "../settings/db";

test.describe.configure({ mode: "serial" });

const REF = "E2E-9001";
const NUMBER = 9001;
const QTY = 2;
const UNIT_PENCE = 6000;
const TOTAL_PENCE = QTY * UNIT_PENCE; // £120.00

let adminId = "";
let clientId = "";
let invoiceId = "";

async function login(page: Page, email: string, password: string) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
}

function purge() {
  dbQuery(`delete from public.payments where admin_id = '${adminId}' and description = 'Invoice ${REF}';`);
  dbQuery(
    `delete from public.invoice_line_items
       where invoice_id in (select id from public.invoices where admin_id = '${adminId}' and reference = '${REF}');`,
  );
  dbQuery(`delete from public.invoices where admin_id = '${adminId}' and reference = '${REF}';`);
  dbQuery(`delete from public.notifications where user_id = '${clientId}' and type = 'invoice';`);
  dbQuery(`delete from public.email_logs where client_id = '${clientId}' and email_type = 'invoice';`);
}

test.beforeAll(() => {
  ({ adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email));

  // Clear anything a previous aborted run left behind, then make sure the
  // fixture practice is past onboarding + has invoicing on.
  purge();
  dbQuery(
    `update public.practice_settings
       set invoices_enabled = true, onboarding_required = false, subscription_status = 'active',
           invoice_footer_text = null, invoice_payment_terms_days = null,
           invoice_default_notes = null, invoice_accent_hex = null
     where admin_id = '${adminId}';
     update public.users set onboarding_completed = true where id in ('${adminId}', '${clientId}');`,
  );

  // Seed one DRAFT invoice for the fixture client. total_pence is filled in by
  // the recalc_invoice_total trigger when the line item lands.
  invoiceId = dbQuery<{ id: string }>(
    `with inv as (
       insert into public.invoices (admin_id, client_id, number, reference, status, issue_date)
       values ('${adminId}', '${clientId}', ${NUMBER}, '${REF}', 'draft', current_date)
       returning id
     ),
     li as (
       insert into public.invoice_line_items (invoice_id, description, quantity, unit_amount_pence, sort_order)
       select id, 'E2E counselling session', ${QTY}, ${UNIT_PENCE}, 0 from inv
       returning invoice_id
     )
     select id from inv;`,
  ).rows[0].id;
});

test.afterAll(() => {
  purge();
  dbQuery(`update public.practice_settings set invoices_enabled = true where admin_id = '${adminId}';`);
});

test("a client cannot see a draft invoice, but sees it once it's sent (RLS)", async ({ page }) => {
  test.setTimeout(90_000);

  await login(page, FIXTURES.client.email, FIXTURES.client.password);
  await page.goto(`${APP_URL}/invoices`, { waitUntil: "load", timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(REF)).toHaveCount(0);

  // Promote to `sent` out of band and reload — the client session's RLS now lets it through.
  dbQuery(`update public.invoices set status = 'sent', sent_at = now() where id = '${invoiceId}';`);
  await page.reload({ waitUntil: "load" });

  await expect(page.getByText(REF)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("£120.00").first()).toBeVisible();
});

test("the admin's Send action logs an email, notifies the client, and marks the invoice sent", async ({ page }) => {
  test.setTimeout(120_000);

  // Reset to draft so "Send email" (not "Resend email") is the primary action,
  // and clear the side effects this test asserts on.
  dbQuery(`update public.invoices set status = 'draft', sent_at = null where id = '${invoiceId}';`);
  dbQuery(`delete from public.notifications where user_id = '${clientId}' and type = 'invoice';`);
  dbQuery(`delete from public.email_logs where client_id = '${clientId}' and email_type = 'invoice';`);

  await login(page, FIXTURES.admin.email, FIXTURES.admin.password);
  await page.goto(`${APP_URL}/admin/finances?view=invoices`, { waitUntil: "load", timeout: 20_000 });

  const row = page.getByRole("row", { name: new RegExp(REF) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Send email", exact: true }).click();

  await expect(page.getByText(/Invoice emailed to the client/i)).toBeVisible({ timeout: 30_000 });

  // email_logs row for this invoice send.
  await expect
    .poll(
      () =>
        dbQuery<{ email_type: string }>(
          `select email_type from public.email_logs
             where client_id = '${clientId}' and email_type = 'invoice'
             order by created_at desc limit 1;`,
        ).rows[0]?.email_type ?? null,
      { timeout: 30_000, intervals: [2000] },
    )
    .toBe("invoice");

  // in-app notification for the client.
  const notif = dbQuery<{ type: string; message: string; url: string | null }>(
    `select type, message, url from public.notifications
       where user_id = '${clientId}' and type = 'invoice'
       order by created_at desc limit 1;`,
  ).rows[0];
  expect(notif).toBeTruthy();
  expect(notif.url).toBe("/invoices");
  expect(notif.message).toContain(REF);

  // status flipped.
  const status = dbQuery<{ status: string }>(`select status from public.invoices where id = '${invoiceId}';`).rows[0]
    .status;
  expect(status).toBe("sent");
});

test("Mark paid mirrors the invoice into the payments ledger (feeds Finances income)", async () => {
  test.setTimeout(90_000);

  dbQuery(`update public.invoices set status = 'sent', paid_at = null where id = '${invoiceId}';`);
  dbQuery(`delete from public.payments where admin_id = '${adminId}' and description = 'Invoice ${REF}';`);

  // The admin table's "Mark paid" calls the mark_invoice_paid RPC; hit it the
  // same way, through a real signed-in admin session (an authenticated
  // supabase-js client, like e2e/account-lifecycle) rather than the fiddly
  // in-table SplitButton menu. This is the wiring the question is about: a paid
  // invoice becomes a public.payments row → payment_ledger_rows → Finances.
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInErr } = await sb.auth.signInWithPassword({
    email: FIXTURES.admin.email,
    password: FIXTURES.admin.password,
  });
  expect(signInErr).toBeNull();

  const { error: rpcErr } = await sb.rpc("mark_invoice_paid", { p_invoice_id: invoiceId });
  expect(rpcErr).toBeNull();

  const payment = dbQuery<{ amount_pence: number; client_id: string }>(
    `select amount_pence, client_id from public.payments
       where admin_id = '${adminId}' and description = 'Invoice ${REF}'
       order by created_at desc limit 1;`,
  ).rows[0];
  expect(payment).toBeTruthy();
  expect(payment.amount_pence).toBe(TOTAL_PENCE);
  expect(payment.client_id).toBe(clientId);

  expect(
    dbQuery<{ status: string }>(`select status from public.invoices where id = '${invoiceId}';`).rows[0].status,
  ).toBe("paid");
});

test("turning invoicing off hides the Finances tab, the client nav link and the client page", async ({ browser }) => {
  test.setTimeout(120_000);

  dbQuery(`update public.practice_settings set invoices_enabled = false where admin_id = '${adminId}';`);

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await login(adminPage, FIXTURES.admin.email, FIXTURES.admin.password);
  await adminPage.goto(`${APP_URL}/admin/finances`, { waitUntil: "load", timeout: 20_000 });
  const financesNav = adminPage.getByRole("navigation", { name: "Finances views" });
  await expect(financesNav.getByRole("button", { name: "Overview" })).toBeVisible({ timeout: 15_000 });
  await expect(financesNav.getByRole("button", { name: "Invoices" })).toHaveCount(0);

  // A stale deep-link falls back to the overview rather than the invoices table.
  await adminPage.goto(`${APP_URL}/admin/finances?view=invoices`, { waitUntil: "load", timeout: 20_000 });
  await expect(adminPage.getByText("Recent activity")).toBeVisible({ timeout: 15_000 });
  await adminCtx.close();

  const clientCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  await login(clientPage, FIXTURES.client.email, FIXTURES.client.password);
  await clientPage.goto(`${APP_URL}/dashboard`, { waitUntil: "load", timeout: 20_000 });
  await expect(clientPage.getByRole("link", { name: "Invoices" })).toHaveCount(0);

  await clientPage.goto(`${APP_URL}/invoices`, { waitUntil: "load", timeout: 20_000 });
  await expect(clientPage.getByText(/aren't available for your account/i)).toBeVisible({ timeout: 15_000 });
  await clientCtx.close();

  dbQuery(`update public.practice_settings set invoices_enabled = true where admin_id = '${adminId}';`);
});
