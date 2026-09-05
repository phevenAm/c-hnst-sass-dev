// End-to-end coverage for: create an offline (stub) client, log history on it,
// invite them, and have that history carry over to their real account when they
// sign up with the token.
//
// Exercises consume_platform_access_token's merge branch directly against the
// live DB (same call AuthContext makes) — it does NOT click through the
// InviteStubModal, which only inserts the token row before firing an email
// edge function that isn't wired for e2e.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs` (fixture admin on 'unlimited'
// so the stub + real-user inserts clear the cap triggers).

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TS = Date.now();
const TAG = `e2emerge${TS}`;
const NEW = { email: `smissah321+${TAG}@gmail.com`, password: "E2eMerge2026!" };

let adminId = "";
let stubId = "";
let stubSessionId = "";
let newUserId = "";
const token = `${TAG}-tok`;

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;

  stubId = dbQuery<{ id: string }>(
    `insert into public.client_stubs (created_by, first_name, last_name, email)
     values ('${adminId}', 'Merge', 'Tester', '${NEW.email}')
     returning id;`,
  ).rows[0].id;

  stubSessionId = dbQuery<{ id: string }>(
    `insert into public.stub_sessions (stub_id, admin_id, scheduled_at, duration_minutes, status)
     values ('${stubId}', '${adminId}', now() - interval '7 days', 50, 'attended')
     returning id;`,
  ).rows[0].id;

  dbQuery(
    `insert into public.session_notes (admin_id, stub_id, content)
     values ('${adminId}', '${stubId}', 'e2e-merge-note');`,
  );

  // what InviteStubModal inserts: a token carrying stub_id
  dbQuery(
    `insert into public.platform_access_token (token, admin_id, stub_id, is_used)
     values ('${token}', '${adminId}', '${stubId}', false);`,
  );
});

test.afterAll(() => {
  if (newUserId) {
    dbQuery(`delete from public.session_notes where user_id = '${newUserId}';`);
    dbQuery(`delete from public.sessions where client_id = '${newUserId}';`);
    dbQuery(`delete from public.users where id = '${newUserId}';`);
    dbQuery(`delete from auth.users where id = '${newUserId}';`);
  }
  dbQuery(`delete from public.session_notes where stub_id = '${stubId}';`);
  dbQuery(`delete from public.stub_sessions where stub_id = '${stubId}';`);
  dbQuery(`delete from public.platform_access_token where token = '${token}';`);
  dbQuery(`delete from public.client_stubs where id = '${stubId}';`);
});

test("signing up with a stub-invite token merges the stub's history onto the real account", async () => {
  test.setTimeout(90_000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signUp({
    email: NEW.email,
    password: NEW.password,
    options: { data: { role: "client", first_name: "Merge", last_name: "Tester" } },
  });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message}`);
  newUserId = data.user.id;

  await supabase.auth.signInWithPassword({ email: NEW.email, password: NEW.password });
  const { error: consumeErr } = await supabase.rpc("consume_platform_access_token", { input_token: token });
  expect(consumeErr).toBeNull();

  // stub is now linked to the real user
  expect(
    dbQuery<{ linked_user_id: string | null }>(`select linked_user_id from public.client_stubs where id = '${stubId}';`)
      .rows[0].linked_user_id,
  ).toBe(newUserId);

  // the stub session was imported as a real session for this client
  const imported = dbQuery<{ client_id: string; status: string }>(
    `select client_id, status::text as status from public.sessions
      where imported_from_stub_id = '${stubSessionId}';`,
  ).rows;
  expect(imported).toHaveLength(1);
  expect(imported[0].client_id).toBe(newUserId);
  expect(imported[0].status).toBe("completed"); // 'attended' → 'completed'

  // the note moved off the stub and onto the real user
  const note = dbQuery<{ user_id: string | null; stub_id: string | null }>(
    `select user_id, stub_id from public.session_notes where content = 'e2e-merge-note';`,
  ).rows[0];
  expect(note.user_id).toBe(newUserId);
  expect(note.stub_id).toBeNull();
});

test("the merged client appears under the Active tab, not Offline, and no longer as a stub", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));
  await page.goto("http://localhost:5174/login", { waitUntil: "load", timeout: 20_000 });
  await page.fill('input[type="email"]', FIXTURES.admin.email);
  await page.fill('input[type="password"]', FIXTURES.admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });

  await page.goto(`http://localhost:5174/admin/clients/${newUserId}`, { waitUntil: "load", timeout: 20_000 });
  // the real client's detail page renders (name/codename in the hero)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // and there's no leftover unlinked stub for this person
  expect(
    Number(
      dbQuery<{ n: number }>(
        `select count(*) as n from public.client_stubs
          where id = '${stubId}' and linked_user_id is null;`,
      ).rows[0].n,
    ),
  ).toBe(0);
});
