// End-to-end coverage for direct messaging — the RLS boundary, the RPCs, and
// the away / out-of-hours auto-reply. Like e2e/agency, this hits the table /
// RPC / edge-function layer directly through real unprivileged supabase-js
// sessions; hiding a button in the UI is not what's under test here.
//
// Two practices are built in the DB (A: admin + their client, B: an outsider
// admin + client) so every isolation assertion is made from a real session
// that legitimately cannot see practice A's thread.
//
// Cleanup: conversations cascade to messages; practice_settings and users are
// removed by TAG, then the matching auth.users rows.

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { createAuthUser, dbQuery } from "../settings/db";

test.describe.configure({ mode: "serial" });

const TAG = `e2emsg${Date.now()}`;
const PASSWORD = "E2eMsgTest2026!";

type Ids = { admin: string; client: string; bAdmin: string; bClient: string };
const ids: Ids = {} as Ids;
let convId: string;

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
    meta: { role: "admin", first_name: "MsgA", last_name: "Admin" },
  });
  ids.client = createAuthUser({
    email: email("client"),
    password: PASSWORD,
    meta: { role: "client", first_name: "MsgA", last_name: "Client" },
  });
  ids.bAdmin = createAuthUser({
    email: email("badmin"),
    password: PASSWORD,
    meta: { role: "admin", first_name: "MsgB", last_name: "Admin" },
  });
  ids.bClient = createAuthUser({
    email: email("bclient"),
    password: PASSWORD,
    meta: { role: "client", first_name: "MsgB", last_name: "Client" },
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
  dbQuery(`delete from public.practice_settings where admin_id in ('${ids.admin}', '${ids.bAdmin}');`);
  dbQuery(`delete from public.users where email like 'smissah321+${TAG}-%@gmail.com';`);
  dbQuery(`delete from auth.users where email like 'smissah321+${TAG}-%@gmail.com';`);
});

test("client can open their own thread and list_my_conversations returns it with the peer's name", async () => {
  const asClient = await signedInAs(email("client"));

  const { data: id, error } = await asClient.rpc("get_or_create_conversation", {
    p_admin_id: ids.admin,
    p_client_id: ids.client,
  });
  expect(error).toBeNull();
  expect(typeof id).toBe("string");
  convId = id as string;

  // Idempotent — a second call returns the same row, not a duplicate.
  const { data: again } = await asClient.rpc("get_or_create_conversation", {
    p_admin_id: ids.admin,
    p_client_id: ids.client,
  });
  expect(again).toBe(convId);

  // The SECURITY DEFINER path: a client has no RLS route to their admin's
  // users row, so an INVOKER function's join would return nothing here.
  const { data: list, error: listErr } = await asClient.rpc("list_my_conversations");
  expect(listErr).toBeNull();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(convId);
  expect(list[0].peer_id).toBe(ids.admin);
  expect(list[0].peer_first_name).toBe("MsgA");
});

test("both parties see the thread; a message is readable by both and counts as unread for the recipient", async () => {
  const asClient = await signedInAs(email("client"));
  const asAdmin = await signedInAs(email("admin"));

  const { data: adminList } = await asAdmin.rpc("list_my_conversations");
  expect(adminList).toHaveLength(1);
  expect(adminList[0].peer_id).toBe(ids.client);

  const { error: sendErr } = await asClient
    .from("messages")
    .insert({ conversation_id: convId, sender_id: ids.client, recipient_id: ids.admin, body: `hello ${TAG}` });
  expect(sendErr).toBeNull();

  const { data: adminReads } = await asAdmin.from("messages").select("body, is_auto").eq("conversation_id", convId);
  expect(adminReads?.map((m) => m.body)).toContain(`hello ${TAG}`);

  const { data: afterSend } = await asAdmin.rpc("list_my_conversations");
  expect(Number(afterSend[0].unread)).toBeGreaterThanOrEqual(1);
  expect(afterSend[0].last_message).toBe(`hello ${TAG}`);
});

test("RLS: a client cannot post as someone else or to the wrong recipient", async () => {
  const asClient = await signedInAs(email("client"));

  const { error: notMe } = await asClient
    .from("messages")
    .insert({ conversation_id: convId, sender_id: ids.admin, recipient_id: ids.client, body: "spoofed" });
  expect(notMe).not.toBeNull();

  const { error: wrongRecipient } = await asClient
    .from("messages")
    .insert({ conversation_id: convId, sender_id: ids.client, recipient_id: ids.client, body: "wrong" });
  expect(wrongRecipient).not.toBeNull();
});

test("mark_conversation_read clears the caller's unread only", async () => {
  const asAdmin = await signedInAs(email("admin"));

  const { error } = await asAdmin.rpc("mark_conversation_read", { p_conversation_id: convId });
  expect(error).toBeNull();

  const { data: list } = await asAdmin.rpc("list_my_conversations");
  expect(Number(list[0].unread)).toBe(0);
});

test("a client cannot open a thread with an admin who isn't theirs", async () => {
  const asClient = await signedInAs(email("client"));
  const { error } = await asClient.rpc("get_or_create_conversation", {
    p_admin_id: ids.bAdmin,
    p_client_id: ids.client,
  });
  expect(error).not.toBeNull();
});

test("cross-practice isolation: practice B cannot read practice A's conversation or messages", async () => {
  for (const who of ["badmin", "bclient"]) {
    const sb = await signedInAs(email(who));

    const { data: convo } = await sb.from("conversations").select("*").eq("id", convId);
    expect(convo ?? []).toHaveLength(0);

    const { data: msgs } = await sb.from("messages").select("*").eq("conversation_id", convId);
    expect(msgs ?? []).toHaveLength(0);

    const { data: list } = await sb.rpc("list_my_conversations");
    expect((list ?? []).some((c: { id: string }) => c.id === convId)).toBe(false);
  }
});

test("away auto-reply: notify-new-message posts an is_auto reply while the practitioner is on holiday, once per cooldown", async () => {
  dbQuery(`
    update public.practice_settings
      set msg_autoreply_enabled = true,
          msg_autoreply_text = 'Away auto-reply ${TAG}',
          msg_away_until = current_date + 1
      where admin_id = '${ids.admin}';
    update public.conversations set autoreply_at = null where id = '${convId}';
  `);

  const asClient = await signedInAs(email("client"));

  const post = async (body: string) => {
    const { data, error } = await asClient
      .from("messages")
      .insert({ conversation_id: convId, sender_id: ids.client, recipient_id: ids.admin, body })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: fnErr } = await asClient.functions.invoke("notify-new-message", { body: { message_id: data?.id } });
    expect(fnErr).toBeNull();
  };

  await post(`ping-1 ${TAG}`);
  await post(`ping-2 ${TAG}`); // second within the 4h cooldown → no extra auto-reply

  // small settle for the function's inserts
  await new Promise((r) => setTimeout(r, 1500));

  const autos = dbQuery<{ body: string }>(
    `select body from public.messages where conversation_id = '${convId}' and is_auto = true;`,
  ).rows;
  expect(autos).toHaveLength(1);
  expect(autos[0].body).toBe(`Away auto-reply ${TAG}`);

  const stamped = dbQuery<{ n: number }>(
    `select count(*)::int as n from public.conversations where id = '${convId}' and autoreply_at is not null;`,
  ).rows[0];
  expect(stamped.n).toBe(1);
});
