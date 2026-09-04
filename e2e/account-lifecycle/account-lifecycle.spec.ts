// End-to-end coverage against the real DB for the account-deletion / retention
// redesign:
//   * export-practice-archive — the "download a full copy" step offered before
//     an admin deletes their account. Owner-only; returns a base64 zip.
//   * pause-practice — admin self-serve pause/resume (read-only lock + Stripe
//     pause). Owner-only; idempotent.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

let adminId = "";
let clientId = "";
let originalSubStatus = "active";
const createdSessions: string[] = [];
const createdPayments: string[] = [];

async function tokenFor(which: "admin" | "client"): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({
    email: FIXTURES[which].email,
    password: FIXTURES[which].password,
  });
  if (error || !data.session) throw new Error(`${which} sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

function invoke(fn: string, token: string | null, body: unknown) {
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const isPaused = () =>
  dbQuery<{ p: boolean }>(`select is_paused as p from public.practice_settings where admin_id = '${adminId}';`).rows[0]
    .p;

test.beforeAll(() => {
  adminId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.admin.email}';`).rows[0].id;
  clientId = dbQuery<{ id: string }>(`select id from auth.users where email = '${FIXTURES.client.email}';`).rows[0].id;
  dbQuery(`update public.users set admin_id = '${adminId}' where id = '${clientId}';`);

  const ps = dbQuery<{ sub: string }>(
    `select subscription_status as sub from public.practice_settings where admin_id = '${adminId}';`,
  ).rows[0];
  originalSubStatus = ps.sub;
  dbQuery(
    `update public.practice_settings
       set subscription_status = 'active', is_paused = false, paused_at = null, paused_reason = null
     where admin_id = '${adminId}';`,
  );

  // One session + one payment so the export has non-zero counts to assert on.
  const sid = dbQuery<{ id: string }>(
    `insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence, paid)
     values ('${clientId}', '${adminId}', now() - interval '2 days', 50, 'completed', 'remote', 5000, true)
     returning id;`,
  ).rows[0].id;
  createdSessions.push(sid);
  const pid = dbQuery<{ id: string }>(
    `insert into public.payments (admin_id, client_id, amount_pence, description, paid_at)
     values ('${adminId}', '${clientId}', 5000, 'e2e export test', now() - interval '2 days')
     returning id;`,
  ).rows[0].id;
  createdPayments.push(pid);
});

test.afterAll(() => {
  // Never leave the shared fixture practice paused — every other spec that uses
  // it would start failing.
  dbQuery(
    `update public.practice_settings
       set subscription_status = '${originalSubStatus}', is_paused = false, paused_at = null, paused_reason = null
     where admin_id = '${adminId}';`,
  );
  if (createdPayments.length)
    dbQuery(`delete from public.payments where id in (${createdPayments.map((i) => `'${i}'`).join(",")});`);
  if (createdSessions.length)
    dbQuery(`delete from public.sessions where id in (${createdSessions.map((i) => `'${i}'`).join(",")});`);
});

// ── export-practice-archive ──────────────────────────────────────────────

test("export: owner gets a zip with sensible counts (happy path)", async () => {
  const res = await invoke("export-practice-archive", await tokenFor("admin"), {});
  expect(res.status).toBe(200);
  const body = await res.json();

  expect(body.success).toBe(true);
  expect(body.filename).toMatch(/^clarity-export-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(body.mime).toBe("application/zip");

  const zip = Buffer.from(body.data_base64, "base64");
  // "PK\x03\x04" — a real zip local-file header, and more than a stub.
  expect(zip.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(zip.byteLength).toBeGreaterThan(2000);

  expect(body.counts.sessions).toBeGreaterThanOrEqual(1);
  expect(body.counts.payments).toBeGreaterThanOrEqual(1);
});

test("export: a client (non-owner) is refused (sad path)", async () => {
  const res = await invoke("export-practice-archive", await tokenFor("client"), {});
  expect(res.status).toBe(403);
});

test("export: no auth is refused (sad path)", async () => {
  const res = await invoke("export-practice-archive", null, {});
  expect(res.status).toBe(401);
});

// ── pause-practice ───────────────────────────────────────────────────────

test("pause: owner can pause then resume (happy path)", async () => {
  const token = await tokenFor("admin");

  const pause = await invoke("pause-practice", token, { paused: true, reason: "e2e" });
  expect(pause.status).toBe(200);
  expect((await pause.json()).success).toBe(true);
  expect(isPaused()).toBe(true);
  expect(
    dbQuery<{ a: string | null }>(`select paused_at as a from public.practice_settings where admin_id = '${adminId}';`)
      .rows[0].a,
  ).not.toBeNull();

  const resume = await invoke("pause-practice", token, { paused: false });
  expect(resume.status).toBe(200);
  expect((await resume.json()).success).toBe(true);
  expect(isPaused()).toBe(false);
});

test("pause: resuming an already-live practice is a no-op, not an error (sad path)", async () => {
  const res = await invoke("pause-practice", await tokenFor("admin"), { paused: false });
  expect(res.status).toBe(200);
  expect((await res.json()).unchanged).toBe(true);
  expect(isPaused()).toBe(false);
});

test("pause: a missing 'paused' field is a 400 (sad path)", async () => {
  const res = await invoke("pause-practice", await tokenFor("admin"), { reason: "no bool" });
  expect(res.status).toBe(400);
});

test("pause: a client (non-owner) cannot pause the practice (sad path)", async () => {
  const res = await invoke("pause-practice", await tokenFor("client"), { paused: true });
  expect(res.status).toBe(403);
  expect(isPaused()).toBe(false);
});

// Regression for 20260904000000: block_paused_write also guards public.users,
// so before the carve-out a paused owner tripped the trigger inside
// delete_own_account() and couldn't actually delete. Uses a throwaway admin —
// the RPC really deletes the account.
test("pause: a paused owner can still delete their own account (carve-out)", async () => {
  const email = `e2e-pausedel-${Date.now()}@clarity-e2e-test.dev`;
  const password = "E2ePausedDelete2026!";
  const uid = createAuthUser({ email, password, meta: { role: "admin", practice_name: "Throwaway Practice" } });

  try {
    dbQuery(`update public.practice_settings set is_paused = true, paused_at = now() where admin_id = '${uid}';`);

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`throwaway sign-in failed: ${error?.message}`);

    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    });
    const { error: rpcErr } = await authed.rpc("delete_own_account");
    expect(rpcErr?.message ?? null, "delete_own_account must not be blocked by the pause lock").toBeNull();

    const left = dbQuery<{ n: number }>(`select count(*)::int as n from public.users where id = '${uid}';`).rows[0].n;
    expect(left).toBe(0);
  } finally {
    // No-ops if the RPC already removed them; safety net if it didn't.
    dbQuery(`delete from public.practice_settings where admin_id = '${uid}';`);
    dbQuery(`delete from auth.users where id = '${uid}';`);
  }
});
