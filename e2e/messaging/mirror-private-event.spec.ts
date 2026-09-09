// End-to-end coverage for "mirror a private calendar event into Messages".
//
// Like the rest of e2e/messaging this drives the table / RPC layer through
// real unprivileged supabase-js sessions — the point under test is the
// SECURITY DEFINER fan-out and its guards, not a button in the UI.
//
// Two practices are built (A: admin + their client, B: an outsider admin +
// client) so every isolation assertion is made from a session that
// legitimately cannot reach practice A's event or thread.
//
// Cleanup: conversations cascade to messages; private events, practice_settings
// and users are removed by admin_id / email, then the matching auth.users rows.

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TAG = `e2emirror${Date.now()}`;
const PASSWORD = "E2eMirrorTest2026!";

type Ids = { admin: string; client: string; bAdmin: string; bClient: string };
const ids: Ids = {} as Ids;
let eventId: string;

const anon = (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signedInAs(email: string): Promise<SupabaseClient> {
  const sb = anon();
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return sb;
}

const email = (who: string) => `smissah321+${TAG}-${who}@gmail.com`;

test.beforeAll(() => {
  ids.admin = createAuthUser({
    email: email("admin"),
    password: PASSWORD,
    meta: { role: "admin", first_name: "MirrorA", last_name: "Admin" },
  });
  ids.client = createAuthUser({
    email: email("client"),
    password: PASSWORD,
    meta: { role: "client", first_name: "MirrorA", last_name: "Client" },
  });
  ids.bAdmin = createAuthUser({
    email: email("badmin"),
    password: PASSWORD,
    meta: { role: "admin", first_name: "MirrorB", last_name: "Admin" },
  });
  ids.bClient = createAuthUser({
    email: email("bclient"),
    password: PASSWORD,
    meta: { role: "client", first_name: "MirrorB", last_name: "Client" },
  });

  dbQuery(`
    update public.users set admin_id = '${ids.admin}',  onboarding_completed = true, has_consented = true where id = '${ids.client}';
    update public.users set admin_id = '${ids.bAdmin}', onboarding_completed = true, has_consented = true where id = '${ids.bClient}';
    update public.users set onboarding_completed = true where id in ('${ids.admin}', '${ids.bAdmin}');
    insert into public.practice_settings (admin_id, subscription_status, onboarding_required)
      values ('${ids.admin}', 'active', false), ('${ids.bAdmin}', 'active', false)
      on conflict (admin_id) do update set subscription_status = 'active', onboarding_required = false;
  `);
});

test.afterAll(() => {
  dbQuery(`delete from public.conversations where admin_id in ('${ids.admin}', '${ids.bAdmin}');`);
  dbQuery(`delete from public.admin_private_events where admin_id in ('${ids.admin}', '${ids.bAdmin}');`);
  dbQuery(`delete from public.practice_settings where admin_id in ('${ids.admin}', '${ids.bAdmin}');`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}-%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}-%@gmail.com';`);
});

test("an admin creates a private event, then mirrors it to their own client", async () => {
  const asAdmin = await signedInAs(email("admin"));

  const { data: evt, error: evtErr } = await asAdmin
    .from("admin_private_events")
    .insert({
      admin_id: ids.admin,
      title: `Away block ${TAG}`,
      starts_at: "2099-01-05T09:00:00Z",
      ends_at: "2099-01-05T17:00:00Z",
    })
    .select("id")
    .single();
  expect(evtErr).toBeNull();
  eventId = evt!.id as string;

  const body = `I won't be available on 5 Jan — ${TAG}`;
  const { data: rows, error } = await asAdmin.rpc("mirror_private_event_to_clients", {
    p_event_id: eventId,
    p_client_ids: [ids.client],
    p_body: body,
  });
  expect(error).toBeNull();
  expect(rows).toHaveLength(1);
  expect(typeof rows[0].message_id).toBe("string");
  expect(typeof rows[0].conversation_id).toBe("string");

  // The written row is an availability notice from the admin to the client,
  // traceable back to the event.
  const { data: msg } = await asAdmin
    .from("messages")
    .select("body, kind, sender_id, recipient_id, private_event_id, is_auto")
    .eq("id", rows[0].message_id)
    .single();
  expect(msg).toMatchObject({
    body,
    kind: "availability",
    sender_id: ids.admin,
    recipient_id: ids.client,
    private_event_id: eventId,
    is_auto: false,
  });

  // mirrored_at is stamped on the event.
  const stamped = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.admin_private_events where id = '${eventId}' and mirrored_at is not null;`,
  ).rows[0];
  expect(stamped.n).toBe(1);
});

test("the client sees the notice in their thread and via list_my_conversations", async () => {
  const asClient = await signedInAs(email("client"));

  const { data: list, error } = await asClient.rpc("list_my_conversations");
  expect(error).toBeNull();
  expect(list).toHaveLength(1);
  expect(list[0].peer_id).toBe(ids.admin);
  expect(list[0].last_message).toContain(TAG);

  const { data: msgs } = await asClient.from("messages").select("body, kind").eq("conversation_id", list[0].id);
  expect(msgs).toHaveLength(1);
  expect(msgs![0].kind).toBe("availability");
});

test("an outsider admin cannot mirror practice A's event", async () => {
  const asBAdmin = await signedInAs(email("badmin"));

  const { error } = await asBAdmin.rpc("mirror_private_event_to_clients", {
    p_event_id: eventId,
    p_client_ids: [ids.bClient],
    p_body: "trying to piggyback",
  });
  expect(error).not.toBeNull();
  expect(error?.message).toMatch(/not your private event/i);
});

test("a client id that isn't the admin's own is silently skipped, not messaged", async () => {
  const asAdmin = await signedInAs(email("admin"));

  const { data: rows, error } = await asAdmin.rpc("mirror_private_event_to_clients", {
    p_event_id: eventId,
    p_client_ids: [ids.bClient],
    p_body: `should not land ${TAG}`,
  });
  expect(error).toBeNull();
  expect(rows).toHaveLength(0);

  // Nothing was written to any of practice B's threads.
  const leaked = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.messages where recipient_id = '${ids.bClient}';`,
  ).rows[0];
  expect(leaked.n).toBe(0);
});

test("an empty message body is rejected", async () => {
  const asAdmin = await signedInAs(email("admin"));

  const { error } = await asAdmin.rpc("mirror_private_event_to_clients", {
    p_event_id: eventId,
    p_client_ids: [ids.client],
    p_body: "   ",
  });
  expect(error).not.toBeNull();
  expect(error?.message).toMatch(/1\.\.4000/);
});

test("re-mirroring appends a second notice to the same thread", async () => {
  const asAdmin = await signedInAs(email("admin"));

  const { data: rows, error } = await asAdmin.rpc("mirror_private_event_to_clients", {
    p_event_id: eventId,
    p_client_ids: [ids.client],
    p_body: `second notice ${TAG}`,
  });
  expect(error).toBeNull();
  expect(rows).toHaveLength(1);

  const total = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.messages where recipient_id = '${ids.client}' and kind = 'availability';`,
  ).rows[0];
  expect(total.n).toBe(2);
});
