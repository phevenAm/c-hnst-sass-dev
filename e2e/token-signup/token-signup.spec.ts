// End-to-end coverage for client sign-up via a practitioner access token —
// the /signup page and the validate_/consume_platform_access_token RPCs, which
// had no e2e today (client-cap only covers the at-cap *rejection* path).
//
//   1. A valid token links the new client to the token's practice and marks
//      the token used (consume RPC, exercised the way AuthContext.signUp does).
//   2. The /signup form refuses a made-up token up front — no account created.
//   3. A token that's already been consumed is refused by the RPC.
//
// IMPORTANT: this spec must never call supabase.auth.signUp() with a real
// smissah321+… address — GoTrue then sends a "Confirm your Clarity account"
// email to the shared inbox whose link is dead by the time anyone clicks it.
// Accounts are created with createAuthUser() (direct auth.users insert,
// email pre-confirmed, no email sent), and the one browser test that submits
// the form uses an invalid token, so it never reaches signUp().
//
// Prereq: `node e2e/settings/seed-fixtures.mjs` (fixture admin is 'unlimited',
// so the consume RPC's client-cap guard passes).

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

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

// Belt-and-braces: if a run is killed between creating an account and its
// afterEach, the per-test cleanup never fires. Sweep anything this spec could
// ever create — both patterns are namespaced so this can't touch real data.
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

test("a valid token links the new client to the practice and burns the token", async () => {
  test.setTimeout(90_000);
  const email = `smissah321+e2e-tokensignup-ok-${TS}@gmail.com`;
  seededToken = seedToken("OK");

  // createAuthUser inserts straight into auth.users with email_confirmed_at
  // set — same effect as a completed signup, but GoTrue sends no email.
  createdUserId = createAuthUser({ email, password: PW, meta: { first_name: "Token", last_name: "Signup" } });

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password: PW });
  expect(signInErr, signInErr?.message).toBeFalsy();

  // validate_ then consume_ — the exact pair AuthContext.signUp runs once the
  // account exists and is signed in.
  const { data: valid } = await anon.rpc("validate_platform_access_token", { input_token: seededToken });
  expect(valid).toBe(true);

  const { data: consumed, error: consumeErr } = await anon.rpc("consume_platform_access_token", {
    input_token: seededToken,
  });
  expect(consumeErr, consumeErr?.message).toBeFalsy();
  expect(consumed).toBe(true);

  const row = dbQuery<{ role: string; admin_id: string | null }>(
    `select role, admin_id from public.users where id = '${createdUserId}';`,
  ).rows[0];
  expect(row.role).toBe("client");
  expect(row.admin_id).toBe(adminId);

  const tok = dbQuery<{ is_used: boolean; used_at: string | null }>(
    `select is_used, used_at from public.platform_access_token where token = '${seededToken}';`,
  ).rows[0];
  expect(tok.is_used).toBe(true);
  expect(tok.used_at).not.toBeNull();
});

test("the /signup form refuses a made-up token before creating anything", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `smissah321+e2e-tokensignup-bad-${TS}@gmail.com`;

  // The form wires each field as <label htmlFor={id}> + <input id={id}>, but
  // the "Date of birth" label also holds an InfoTooltip trigger that pollutes
  // getByLabel's accessible-name match — target by id.
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto(`${APP_URL}/signup`, { waitUntil: "load", timeout: 20_000 });
  await page.locator("#firstName").fill("Token");
  await page.locator("#lastName").fill("Signup");
  await page.locator("#email").fill(email);
  await page.locator("#dob").fill("1990-06-15");
  await page.locator("#accessToken").fill(`NOPE-NOT-A-REAL-TOKEN-${TS}`);
  await page.locator("#password").fill(PW);
  await page.locator("#confirm").fill(PW);
  await page.getByRole("button", { name: "Create account" }).click();

  // AuthContext validates the token first and throws before it ever calls
  // supabase.auth.signUp — so no account, and (critically) no GoTrue email.
  await expect(page.getByRole("alert")).toContainText(/invalid or already-used access token/i, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/signup$/);

  const count = dbQuery<{ n: string }>(`select count(*)::text as n from auth.users where email = '${email}';`).rows[0]
    .n;
  expect(count).toBe("0");
});

test("a token that has already been consumed is refused by consume_platform_access_token", async () => {
  test.setTimeout(90_000);
  seededToken = seedToken("USED");
  dbQuery(`update public.platform_access_token set is_used = true, used_at = now() where token = '${seededToken}';`);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: valid } = await anon.rpc("validate_platform_access_token", { input_token: seededToken });
  expect(valid).toBe(false);

  const email = `smissah321+e2e-tokensignup-used-${TS}@gmail.com`;
  createdUserId = createAuthUser({ email, password: PW, meta: { first_name: "Used", last_name: "Token" } });
  const { error: signInErr } = await anon.auth.signInWithPassword({ email, password: PW });
  expect(signInErr, signInErr?.message).toBeFalsy();

  const { data: consumed } = await anon.rpc("consume_platform_access_token", { input_token: seededToken });
  expect(consumed).toBe(false);
  expect(
    dbQuery<{ admin_id: string | null }>(`select admin_id from public.users where id = '${createdUserId}';`).rows[0]
      .admin_id,
  ).toBeNull();
});
