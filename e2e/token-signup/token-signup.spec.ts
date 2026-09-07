// End-to-end coverage for client sign-up via a practitioner access token —
// the /signup page, AuthContext.signUp, the auto-confirm-signup edge function,
// and the validate_/consume_platform_access_token RPCs, none of which had an
// e2e today (client-cap only covers the at-cap *rejection* path).
//
//   1. Happy path: a valid token + the /signup form creates a client account,
//      links it to the token's practice, marks the token used, and lands the
//      new user on /dashboard.
//   2. A made-up token is refused at the form with no account created.
//   3. A token that's already been consumed is refused by the RPC.
//
// Creates a real auth user through the real UI; afterEach hard-removes it and
// the seeded token regardless of outcome. Uses a fresh gmail "+alias" per run
// so a crashed run can't wedge the next one on a duplicate email.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs` (fixture admin is 'unlimited',
// so the consume RPC's client-cap guard passes).

import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
const TS = Date.now();
// track everything created so afterEach can always undo it
let createdUserId = "";
let seededToken = "";

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
});

test.afterEach(() => {
  if (createdUserId) {
    dbQuery(`delete from public.users where id = '${createdUserId}';`);
    dbQuery(`delete from auth.users where id = '${createdUserId}';`);
    createdUserId = "";
  }
  if (seededToken) {
    dbQuery(`delete from public.platform_access_token where token = '${seededToken}';`);
    seededToken = "";
  }
});

// Belt-and-braces: if a run is killed between a signup and its afterEach (e.g.
// the process is SIGKILLed), the per-test cleanup never fires. Sweep anything
// this spec could ever create — both are namespaced so this can't touch real
// data or other specs' fixtures.
test.afterAll(() => {
  dbQuery(`delete from public.users where id in (
             select id from auth.users where email like 'smissah321+e2e-tokensignup-%');`);
  dbQuery(`delete from auth.users where email like 'smissah321+e2e-tokensignup-%';`);
  dbQuery(`delete from public.platform_access_token where token like 'E2E-SIGNUP-%';`);
});

function seedToken(tag: string): string {
  const token = `E2E-SIGNUP-${tag}-${TS}`;
  dbQuery(
    `insert into public.platform_access_token (token, admin_id, is_used) values ('${token}', '${adminId}', false);`,
  );
  return token;
}

const PW = "E2eTokenSignup2026!";

// The signup form wires each field as <label htmlFor={id}> + <input id={id}>,
// but the "Date of birth" label also contains an InfoTooltip trigger, which
// pollutes getByLabel's accessible-name match — so target by id throughout.
async function fillSignupForm(page: Page, opts: { email: string; token: string; password?: string }) {
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/signup`, { waitUntil: "load", timeout: 20_000 });
  await page.locator("#firstName").fill("Token");
  await page.locator("#lastName").fill("Signup");
  await page.locator("#email").fill(opts.email);
  await page.locator("#dob").fill("1990-06-15");
  await page.locator("#accessToken").fill(opts.token);
  await page.locator("#password").fill(opts.password ?? PW);
  await page.locator("#confirm").fill(opts.password ?? PW);
}

const submitSignup = (page: Page) => page.getByRole("button", { name: "Create account" }).click();

test("a valid token creates a client linked to the practice and consumes the token", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `smissah321+e2e-tokensignup-ok-${TS}@gmail.com`;
  seededToken = seedToken("OK");

  await fillSignupForm(page, { email, token: seededToken });
  await submitSignup(page);

  // AuthContext holds the spinner through token-consume + stub merge, then the
  // client lands on their dashboard.
  await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 90_000 });

  const row = dbQuery<{ id: string; role: string; admin_id: string | null }>(
    `select id, role, admin_id from public.users where id = (select id from auth.users where email = '${email}');`,
  ).rows[0];
  expect(row, "a public.users row should exist for the new account").toBeTruthy();
  createdUserId = row.id;

  expect(row.role).toBe("client");
  expect(row.admin_id).toBe(adminId);

  const tok = dbQuery<{ is_used: boolean; used_at: string | null }>(
    `select is_used, used_at from public.platform_access_token where token = '${seededToken}';`,
  ).rows[0];
  expect(tok.is_used).toBe(true);
  expect(tok.used_at).not.toBeNull();
});

test("a made-up token is refused at the form and creates nothing", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `smissah321+e2e-tokensignup-bad-${TS}@gmail.com`;

  await fillSignupForm(page, { email, token: `NOPE-NOT-A-REAL-TOKEN-${TS}` });
  await submitSignup(page);

  await expect(page.getByRole("alert")).toContainText(/invalid or already-used access token/i, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/signup$/);

  const count = dbQuery<{ n: string }>(`select count(*)::text as n from auth.users where email = '${email}';`).rows[0]
    .n;
  expect(count).toBe("0");
});

test("a token that has already been consumed is refused by consume_platform_access_token", async () => {
  test.setTimeout(90_000);
  seededToken = seedToken("USED");
  // Simulate a token that a prior signup already burned.
  dbQuery(`update public.platform_access_token set is_used = true, used_at = now() where token = '${seededToken}';`);

  // validate_ should say no…
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: valid } = await anon.rpc("validate_platform_access_token", { input_token: seededToken });
  expect(valid).toBe(false);

  // …and even a signed-in user calling consume_ directly gets false, not a link.
  const email = `smissah321+e2e-tokensignup-used-${TS}@gmail.com`;
  const password = "E2eTokenSignup2026!";
  const { data: signUpData, error: signUpErr } = await anon.auth.signUp({
    email,
    password,
    options: { data: { first_name: "Used", last_name: "Token" } },
  });
  expect(signUpErr, signUpErr?.message).toBeFalsy();
  createdUserId = signUpData.user?.id ?? "";
  expect(createdUserId).not.toBe("");
  dbQuery(`update auth.users set email_confirmed_at = now() where id = '${createdUserId}';`);
  await anon.auth.signInWithPassword({ email, password });

  const { data: consumed } = await anon.rpc("consume_platform_access_token", { input_token: seededToken });
  expect(consumed).toBe(false);
  expect(
    dbQuery<{ admin_id: string | null }>(`select admin_id from public.users where id = '${createdUserId}';`).rows[0]
      .admin_id,
  ).toBeNull();
});
