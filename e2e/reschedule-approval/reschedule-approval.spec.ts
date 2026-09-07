// End-to-end coverage for the client → admin reschedule loop and the RLS that
// backs it. The reschedule *cutoff* UI is covered in settings-behavior.spec.ts;
// this covers what happens once a request is actually made:
//
//   1. A client can file a reschedule request for their own session (the
//      "clients can insert own reschedule requests" policy) and read it back.
//   2. A client CANNOT move the request to 'accepted' themselves — there is no
//      client UPDATE policy, so the row stays 'pending'.
//   3. The admin approving it (the exact two writes AdminClientsPageDetailed's
//      handleAcceptReschedule makes) moves the session to the requested time
//      and marks it 'rescheduled' + the request 'accepted'.
//
// Drives Supabase directly with the fixture admin/client sessions rather than
// the MUI date-picker modal (same rationale as session-payment.spec.ts). The
// seeded session is deleted in afterAll on every exit path, which cascades the
// reschedule_requests row with it.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs`.

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

import { FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";
import { dbQuery, insertSessions, lookupFixtureIds } from "../settings/db";

test.describe.configure({ mode: "serial" });

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return supabase;
}

let sessionId = "";
const ORIGINAL_AT = dayjs().add(30, "hour").second(0).millisecond(0);
const REQUESTED_AT = dayjs().add(200, "hour").second(0).millisecond(0);

test.beforeAll(() => {
  const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);

  // check_session_overlap rejects a rerun's session colliding with a previous
  // run's leftovers at the same now()+N offset — clear both slices first.
  dbQuery(
    `delete from public.sessions where created_by = '${adminId}'
       and scheduled_at between now() + interval '28 hours' and now() + interval '32 hours';`,
  );
  dbQuery(
    `delete from public.sessions where created_by = '${adminId}'
       and scheduled_at between now() + interval '198 hours' and now() + interval '202 hours';`,
  );

  sessionId = insertSessions([
    { label: "s", clientId, adminId, scheduledAt: ORIGINAL_AT.toISOString(), paid: false },
  ]).s;
});

test.afterAll(() => {
  if (sessionId) dbQuery(`delete from public.sessions where id = '${sessionId}';`); // cascades reschedule_requests
});

test("a client files a reschedule request and can read it back as pending", async () => {
  test.setTimeout(60_000);
  const { clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
  const clientDb = await signIn(FIXTURES.client.email, FIXTURES.client.password);

  const { error: insErr } = await clientDb.from("reschedule_requests").insert({
    session_id: sessionId,
    client_id: clientId,
    requested_at: REQUESTED_AT.toISOString(),
    message: "e2e — can we move this later?",
  });
  expect(insErr, insErr?.message).toBeFalsy();

  const { data, error: selErr } = await clientDb
    .from("reschedule_requests")
    .select("status, requested_at")
    .eq("session_id", sessionId)
    .single();
  expect(selErr, selErr?.message).toBeFalsy();
  expect(data?.status).toBe("pending");
});

test("a client cannot approve their own reschedule request (no client UPDATE policy)", async () => {
  test.setTimeout(60_000);
  const clientDb = await signIn(FIXTURES.client.email, FIXTURES.client.password);

  // RLS makes this a silent no-op (0 rows matched), not an error.
  await clientDb.from("reschedule_requests").update({ status: "accepted" }).eq("session_id", sessionId);

  const stillPending = dbQuery<{ status: string }>(
    `select status from public.reschedule_requests where session_id = '${sessionId}';`,
  ).rows[0];
  expect(stillPending.status).toBe("pending");
});

test("the admin approving it moves the session and marks both rows", async () => {
  test.setTimeout(60_000);
  const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

  const { data: req } = await adminDb
    .from("reschedule_requests")
    .select("id, requested_at")
    .eq("session_id", sessionId)
    .single();
  const reqRow = req as { id: string; requested_at: string } | null;
  if (!reqRow) throw new Error("reschedule request row not found");

  // The two writes handleAcceptReschedule performs, in order.
  const { error: sessErr } = await adminDb
    .from("sessions")
    .update({ scheduled_at: reqRow.requested_at, status: "rescheduled" })
    .eq("id", sessionId);
  expect(sessErr, sessErr?.message).toBeFalsy();

  const { error: reqErr } = await adminDb
    .from("reschedule_requests")
    .update({ status: "accepted" })
    .eq("id", reqRow.id);
  expect(reqErr, reqErr?.message).toBeFalsy();

  const session = dbQuery<{ scheduled_at: string; status: string }>(
    `select scheduled_at, status from public.sessions where id = '${sessionId}';`,
  ).rows[0];
  expect(dayjs(session.scheduled_at).toISOString()).toBe(REQUESTED_AT.toISOString());
  expect(session.status).toBe("rescheduled");

  const request = dbQuery<{ status: string }>(
    `select status from public.reschedule_requests where session_id = '${sessionId}';`,
  ).rows[0];
  expect(request.status).toBe("accepted");
});
