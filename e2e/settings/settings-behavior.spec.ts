// Real end-to-end tests for what admin practice_settings actually DO, not
// just whether the Settings UI renders (see settings.spec.ts for that).
// These hit the real deployed edge functions and the real Supabase project,
// against a dedicated e2e fixture admin/client (never demo-admin@honest.com —
// see settings.spec.ts's header comment for why that account is off-limits).
//
// Requires fixtures created once via `node e2e/settings/seed-fixtures.mjs`
// (also re-run it if a test run leaves state you want reset — it's idempotent).
//
// Each `supabase db query` call (via ./db.ts) pays a ~4s CLI startup cost, so
// these tests batch statements together wherever possible and still run
// with generous timeouts — don't be surprised these take 30-60s each.

import { expect, type Page, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "./constants";
import { dbQuery, insertSessions, lookupFixtureIds } from "./db";

// All tests here share one fixture admin/client and hit the Supabase CLI
// (./db.ts) for privileged setup — running two of them concurrently caused a
// real, reproducible flake (one test's CLI call apparently starving/slowing
// another's), on top of both potentially racing writes to the same
// practice_settings row. Force this whole file onto a single worker.
test.describe.configure({ mode: "serial" });

function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const supabase = freshClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return supabase;
}

async function dismissOnboarding(page: Page) {
  try {
    await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
    const dismissBtn = page
      .locator('button:has-text("Save"), button:has-text("Skip"), button:has-text("No thanks")')
      .first();
    if (await dismissBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dismissBtn.click();
    }
    await page.waitForTimeout(600);
  } catch {
    // no onboarding modal
  }
}

async function loginInBrowser(page: Page, email: string, password: string) {
  // The walkthrough "want a quick tour?" offer is purely localStorage-driven
  // (WalkthroughContext.tsx) and unrelated to anything under test here — it
  // fires on a delay after each first page visit in a fresh browser context,
  // which raced with (and sometimes visually stacked on top of) the actual
  // modal a test is asserting on. Suppress it up front instead of guessing
  // at its timing.
  await page.addInitScript(() => {
    localStorage.setItem("walkthrough_globally_dismissed", "true");
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 20000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
  await dismissOnboarding(page);
}

// ── Reschedule / cancellation cutoff ────────────────────────────────────────
//
// practice_settings.reschedule_cutoff_hours is meant to stop a client from
// touching a session that's coming up too soon. Enforcement is entirely
// client-side UI hiding (SessionCard.tsx): inside the cutoff window, the
// Reschedule/Cancel buttons are removed from the DOM, not just disabled.

test.describe("Reschedule cutoff", () => {
  test("hides Reschedule inside the cutoff window and shows it outside — until the cutoff is turned off", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    await adminDb.from("practice_settings").update({ reschedule_cutoff_hours: 48 }).eq("admin_id", adminId);

    // A filler session becomes the featured "next session" strip, which
    // always shows a Reschedule button regardless of cutoff (it warns via a
    // toast instead of hiding — see NextSessionCard.tsx). Scheduling it
    // soonest keeps the two sessions under test in the plain list below,
    // where the real hide/show behavior lives.
    const filler = dayjs().add(1, "hour").second(0).millisecond(0);
    const near = dayjs().add(10, "hour").second(0).millisecond(0); // inside the 48h cutoff
    const far = dayjs().add(240, "hour").second(0).millisecond(0); // outside the 48h cutoff

    insertSessions([
      { label: "filler", clientId, adminId, scheduledAt: filler.toISOString(), paid: false },
      { label: "near", clientId, adminId, scheduledAt: near.toISOString(), paid: false },
      { label: "far", clientId, adminId, scheduledAt: far.toISOString(), paid: false },
    ]);

    const nearLabel = near.format("dddd D MMM YYYY · h:mma");
    const farLabel = far.format("dddd D MMM YYYY · h:mma");

    await loginInBrowser(page, FIXTURES.client.email, FIXTURES.client.password);
    await page.goto(`${APP_URL}/my-sessions`, { waitUntil: "load", timeout: 20000 });
    await page.getByRole("button", { name: "List" }).click();

    // Each session card is a single <div> whose only text ancestor chain is
    // <p class="date"> inside a header row div inside the card root — two
    // levels up from the date text lands on the card itself (SessionCard.tsx).
    const nearCard = page.getByText(nearLabel, { exact: true }).locator("xpath=../..");
    const farCard = page.getByText(farLabel, { exact: true }).locator("xpath=../..");

    await expect(farCard.getByRole("button", { name: "Reschedule" })).toBeVisible();
    await expect(nearCard.getByRole("button", { name: "Reschedule" })).toHaveCount(0);

    // Turn the cutoff off entirely — the near session's button should appear too.
    await adminDb.from("practice_settings").update({ reschedule_cutoff_hours: null }).eq("admin_id", adminId);
    await page.reload({ waitUntil: "load", timeout: 20000 });
    await page.getByRole("button", { name: "List" }).click();

    await expect(nearCard.getByRole("button", { name: "Reschedule" })).toBeVisible();
  });
});

// ── Client consent gate ─────────────────────────────────────────────────────
//
// practice_settings.consent_enabled is meant to block a client from using
// the app at all until they agree to the admin's terms (ConsentGate in
// Router.tsx renders a full-screen blocking ConsentModal).

test.describe("Client consent gate", () => {
  test("blocks an unconsented client until they agree, then stays cleared on reload", async ({ page }) => {
    test.setTimeout(180_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    dbQuery(`update public.users set has_consented = false, consented_at = null where id = '${clientId}';`);
    await adminDb
      .from("practice_settings")
      .update({
        consent_enabled: true,
        consent_title: "E2E consent check",
        consent_body: "By continuing you agree to the e2e test terms.",
      })
      .eq("admin_id", adminId);

    await loginInBrowser(page, FIXTURES.client.email, FIXTURES.client.password);

    const dialog = page.getByRole("dialog", { name: "Terms and consent" });
    // ConsentGate fetches consent settings via an RPC that fires from a
    // useEffect after the profile loads — this occasionally races on first
    // mount and misses it. A reload re-runs the whole fetch sequence against
    // the same already-committed DB state, so retrying resolves a one-time
    // timing race rather than masking a real failure. Each attempt gets an
    // explicit timeout (Playwright's page.reload has none by default) so a
    // genuinely hung reload fails fast instead of eating the whole test budget.
    let appeared = false;
    for (let attempt = 0; attempt < 3 && !appeared; attempt++) {
      if (attempt > 0) {
        await page.reload({ waitUntil: "load", timeout: 15000 }).catch(() => {});
      }
      appeared = await dialog
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(appeared, "consent dialog never appeared after retrying").toBe(true);
    await expect(dialog.getByRole("heading", { name: "E2E consent check" })).toBeVisible();
    await expect(dialog.getByText("By continuing you agree to the e2e test terms.")).toBeVisible();

    const continueBtn = dialog.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    await dialog.getByRole("checkbox").check();
    await continueBtn.click();
    await expect(dialog).not.toBeVisible();

    // Reload — having agreed once, the gate shouldn't come back.
    await page.reload({ waitUntil: "load", timeout: 20000 });
    await expect(page.getByRole("dialog", { name: "Terms and consent" })).not.toBeVisible({ timeout: 5000 });
  });

  test("never appears while the gate is turned off", async ({ page }) => {
    test.setTimeout(60_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    dbQuery(`update public.users set has_consented = false, consented_at = null where id = '${clientId}';`);
    await adminDb.from("practice_settings").update({ consent_enabled: false }).eq("admin_id", adminId);

    await loginInBrowser(page, FIXTURES.client.email, FIXTURES.client.password);
    await page.waitForTimeout(1500); // give the gate's RPC fetch a chance to resolve if it were going to show
    await expect(page.getByRole("dialog", { name: "Terms and consent" })).toHaveCount(0);
  });
});

// ── Disabled email types ────────────────────────────────────────────────────
//
// practice_settings.disabled_email_types is meant to suppress a specific
// transactional email. Invokes the same edge function the app calls after a
// cancellation (notify-session-cancelled) and checks the real email_logs row
// it writes either way — "skipped" when disabled, "sent" when not.

test.describe("Disabled email types", () => {
  test("disabling session_cancelled logs it as skipped; re-enabling it actually sends", async () => {
    test.setTimeout(90_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    const { skipped: skippedSessionId, sent: sentSessionId } = insertSessions([
      { label: "skipped", clientId, adminId, scheduledAt: dayjs().add(80, "hour").toISOString(), paid: false },
      { label: "sent", clientId, adminId, scheduledAt: dayjs().add(81, "hour").toISOString(), paid: false },
    ]);

    await adminDb
      .from("practice_settings")
      .update({ disabled_email_types: ["session_cancelled"] })
      .eq("admin_id", adminId);

    const { error: skipErr } = await adminDb.functions.invoke("notify-session-cancelled", {
      body: { session_id: skippedSessionId },
    });
    expect(skipErr, skipErr?.message).toBeFalsy();

    const skippedLog = dbQuery<{ status: string }>(
      `select status from public.email_logs where session_id = '${skippedSessionId}' and email_type = 'session_cancelled' order by created_at desc limit 1;`,
    ).rows[0];
    expect(skippedLog?.status).toBe("skipped");

    await adminDb.from("practice_settings").update({ disabled_email_types: [] }).eq("admin_id", adminId);

    const { error: sentErr } = await adminDb.functions.invoke("notify-session-cancelled", {
      body: { session_id: sentSessionId },
    });
    expect(sentErr, sentErr?.message).toBeFalsy();

    const sentLog = dbQuery<{ status: string }>(
      `select status from public.email_logs where session_id = '${sentSessionId}' and email_type = 'session_cancelled' order by created_at desc limit 1;`,
    ).rows[0];
    expect(sentLog?.status).toBe("sent");
  });
});

// ── Auto-cancel unpaid sessions ─────────────────────────────────────────────
//
// practice_settings.auto_cancel_enabled + payment_deadline_hours are meant
// to cancel an overdue unpaid session automatically. The real mechanism is
// an hourly pg_cron job calling the global public.auto_cancel_unpaid_sessions()
// function, which sweeps every admin's overdue sessions in one shot — not
// something this suite should invoke directly, since a bug in the fixture
// setup would then cancel real customers' sessions early. Instead this runs
// the identical WHERE-clause logic scoped to just the two fixture sessions
// created below, which proves the setting gates the same outcome without
// touching anyone else's data.

test.describe("Auto-cancel unpaid sessions", () => {
  test("only cancels an overdue unpaid session once auto_cancel_enabled is on, and never touches a paid one", async () => {
    test.setTimeout(60_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    await adminDb
      .from("practice_settings")
      .update({ auto_cancel_enabled: false, payment_deadline_hours: 48 })
      .eq("admin_id", adminId);

    const { unpaid: unpaidId, paid: paidId } = insertSessions([
      { label: "unpaid", clientId, adminId, scheduledAt: dayjs().add(5, "hour").toISOString(), paid: false },
      { label: "paid", clientId, adminId, scheduledAt: dayjs().add(6, "hour").toISOString(), paid: true },
    ]);

    const runScopedAutoCancel = () =>
      dbQuery<{ id: string }>(`
        update public.sessions s
        set status = 'cancelled'
        from public.practice_settings ps
        where ps.admin_id = s.created_by
          and ps.admin_id = '${adminId}'
          and ps.auto_cancel_enabled = true
          and s.status = 'scheduled'
          and s.paid = false
          and s.scheduled_at <= now() + (ps.payment_deadline_hours * interval '1 hour')
          and s.id = any(array['${unpaidId}', '${paidId}']::uuid[])
        returning s.id;
      `).rows;

    // Disabled: nothing happens even though the session is overdue.
    expect(runScopedAutoCancel()).toEqual([]);

    // Enabled via the real Settings save path (RLS-authenticated admin update).
    await adminDb.from("practice_settings").update({ auto_cancel_enabled: true }).eq("admin_id", adminId);

    const cancelled = runScopedAutoCancel();
    expect(cancelled.map((r) => r.id)).toEqual([unpaidId]);

    const finalStatuses = dbQuery<{ id: string; status: string }>(
      `select id, status from public.sessions where id in ('${unpaidId}', '${paidId}');`,
    ).rows;
    expect(finalStatuses.find((r) => r.id === unpaidId)?.status).toBe("cancelled");
    expect(finalStatuses.find((r) => r.id === paidId)?.status).toBe("scheduled");
  });
});

// ── Block-session cancellation ──────────────────────────────────────────────
//
// practice_settings.allow_block_session_cancellation (added 2026-08-20) gates
// whether a client can request to cancel a single session that's part of a
// block booking, independent of whether that block has been paid yet — see
// request-cancel-session/index.ts.

test.describe("Block session cancellation setting", () => {
  test("blocks the request when off, allows it when on", async () => {
    test.setTimeout(90_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);
    const clientDb = await signIn(FIXTURES.client.email, FIXTURES.client.password);

    // check_session_overlap (20260817000000_no_double_booking.sql) rejects
    // any two non-cancelled sessions for the same admin whose time ranges
    // intersect — a re-run of this test lands its new sessions at nearly the
    // same "now + N hours" offset as a previous run's leftovers, which is
    // well within the 50-minute overlap window. Clear this test's slice of
    // the calendar first so a rerun can't collide with itself.
    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '89 hours' and now() + interval '93 hours';`,
    );

    const blockId = `e2e-block-${Date.now()}`;
    const { blocked, allowed } = insertSessions([
      {
        label: "blocked",
        clientId,
        adminId,
        scheduledAt: dayjs().add(90, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
      {
        label: "allowed",
        clientId,
        adminId,
        scheduledAt: dayjs().add(91, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
    ]);

    await adminDb.from("practice_settings").update({ allow_block_session_cancellation: false }).eq("admin_id", adminId);

    const { error: blockedErr } = await clientDb.functions.invoke("request-cancel-session", {
      body: { session_id: blocked },
    });
    // supabase-js surfaces a non-2xx edge function response as a
    // FunctionsHttpError on `error`, not a JSON body on `data` — the actual
    // { error: "..." } payload the function returned lives on the raw
    // Response at error.context.
    expect(blockedErr, "expected a FunctionsHttpError (the function should reject this)").toBeTruthy();
    const blockedBody = await (blockedErr as { context: Response }).context.json();
    expect(blockedBody.error).toContain("can't be cancelled individually");

    // Confirm no request was actually recorded.
    const pendingCount = dbQuery<{ count: string }>(
      `select count(*)::text as count from public.cancellation_requests where session_id = '${blocked}';`,
    ).rows[0];
    expect(pendingCount.count).toBe("0");

    await adminDb.from("practice_settings").update({ allow_block_session_cancellation: true }).eq("admin_id", adminId);

    const { error: allowedErr } = await clientDb.functions.invoke("request-cancel-session", {
      body: { session_id: allowed },
    });
    expect(allowedErr, allowedErr?.message).toBeFalsy();

    const recorded = dbQuery<{ count: string }>(
      `select count(*)::text as count from public.cancellation_requests where session_id = '${allowed}' and status = 'pending';`,
    ).rows[0];
    expect(recorded.count).toBe("1");
  });
});

// ── Block payment cascade ───────────────────────────────────────────────────
//
// sessions_cascade_block_payment (added 2026-08-20) marks every sibling in a
// block as paid whenever any one of them gets marked paid, regardless of
// which code path did it — tested here at the DB level with a raw UPDATE so
// it covers the trigger itself, not any one call site.

test.describe("Block payment cascade", () => {
  test("marking one block session paid marks every unpaid sibling paid too", () => {
    test.setTimeout(60_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);

    // See the identical comment in "Block session cancellation setting" —
    // check_session_overlap rejects a rerun's sessions colliding with a
    // previous run's leftovers at nearly the same "now + N hours" offset.
    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '99 hours' and now() + interval '103 hours';`,
    );

    const blockId = `e2e-payblock-${Date.now()}`;
    const { first, second, third } = insertSessions([
      {
        label: "first",
        clientId,
        adminId,
        scheduledAt: dayjs().add(100, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
      {
        label: "second",
        clientId,
        adminId,
        scheduledAt: dayjs().add(101, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
      {
        label: "third",
        clientId,
        adminId,
        scheduledAt: dayjs().add(102, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
    ]);

    // "second" is mid-approval on a manual (bank transfer) payment — the
    // cascade should settle it to 'approved', not leave it dangling on
    // 'pending' once the block is already paid.
    dbQuery(`update public.sessions set manual_payment_status = 'pending' where id = '${second}';`);

    dbQuery(`update public.sessions set paid = true, paid_at = now() where id = '${first}';`);

    const rows = dbQuery<{ id: string; paid: boolean; manual_payment_status: string }>(
      `select id, paid, manual_payment_status from public.sessions where id in ('${first}', '${second}', '${third}');`,
    ).rows;

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[first].paid).toBe(true);
    expect(byId[second].paid).toBe(true);
    expect(byId[second].manual_payment_status).toBe("approved");
    expect(byId[third].paid).toBe(true);
  });

  test("does not touch sessions outside the block", () => {
    test.setTimeout(60_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);

    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '103 hours' and now() + interval '105 hours';`,
    );

    const blockId = `e2e-payblock-${Date.now()}`;
    const { inBlock, outsideBlock } = insertSessions([
      {
        label: "inBlock",
        clientId,
        adminId,
        scheduledAt: dayjs().add(103, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
      { label: "outsideBlock", clientId, adminId, scheduledAt: dayjs().add(104, "hour").toISOString(), paid: false },
    ]);

    dbQuery(`update public.sessions set paid = true, paid_at = now() where id = '${inBlock}';`);

    const outside = dbQuery<{ paid: boolean }>(`select paid from public.sessions where id = '${outsideBlock}';`)
      .rows[0];
    expect(outside.paid).toBe(false);
  });

  test("unmarking one paid block session as unpaid reverts the whole block, not just that session", () => {
    test.setTimeout(60_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);

    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '105 hours' and now() + interval '108 hours';`,
    );

    const blockId = `e2e-unpayblock-${Date.now()}`;
    const { first, second } = insertSessions([
      {
        label: "first",
        clientId,
        adminId,
        scheduledAt: dayjs().add(105, "hour").toISOString(),
        paid: true,
        metadata: { block_id: blockId },
      },
      {
        label: "second",
        clientId,
        adminId,
        scheduledAt: dayjs().add(106, "hour").toISOString(),
        paid: true,
        metadata: { block_id: blockId },
      },
    ]);
    dbQuery(`update public.sessions set manual_payment_status = 'approved' where id in ('${first}', '${second}');`);

    dbQuery(`update public.sessions set paid = false where id = '${first}';`);

    const rows = dbQuery<{ id: string; paid: boolean; manual_payment_status: string }>(
      `select id, paid, manual_payment_status from public.sessions where id in ('${first}', '${second}');`,
    ).rows;
    for (const row of rows) {
      expect(row.paid, `${row.id} should be unpaid after unmarking either session in the block`).toBe(false);
      expect(row.manual_payment_status).toBe("none");
    }
  });
});

// ── Block booking: one confirmation email, not one per session ──────────────
//
// Booking a recurring block used to fire notify-session-booked once per
// session (4 emails for a block of 4) and stamp the whole-block price on
// every row. notify-block-booked (added 2026-08-29) sends a single email for
// the whole block, logged once against the earliest session. The frontend
// now also divides the block price across the rows so they sum back to the
// block total — covered by CreateSessionModal.test.tsx; this e2e proves the
// email side against the real deployed function + email_logs.

test.describe("Block booking confirmation email", () => {
  test("notify-block-booked logs exactly one email for the whole block", async () => {
    test.setTimeout(90_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    await adminDb.from("practice_settings").update({ disabled_email_types: [] }).eq("admin_id", adminId);

    // Overlap trigger (check_session_overlap) rejects a rerun colliding with
    // its own leftovers at the same now()+N offset — clear this slice first.
    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '119 hours' and now() + interval '125 hours';`,
    );

    const blockId = `e2e-blockmail-${Date.now()}`;
    const { first, second, third } = insertSessions([
      {
        label: "first",
        clientId,
        adminId,
        scheduledAt: dayjs().add(120, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId, block_pos: 1, block_total: 3 },
      },
      {
        label: "second",
        clientId,
        adminId,
        scheduledAt: dayjs().add(121, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId, block_pos: 2, block_total: 3 },
      },
      {
        label: "third",
        clientId,
        adminId,
        scheduledAt: dayjs().add(122, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId, block_pos: 3, block_total: 3 },
      },
    ]);

    // Clear any notifications a previous run left for this admin/client so the
    // assertions below only see this invocation's output.
    dbQuery(
      `delete from public.notifications where user_id in ('${adminId}', '${clientId}') and type in ('session_booked', 'email_sent');`,
    );

    const { error } = await adminDb.functions.invoke("notify-block-booked", {
      body: { session_ids: [first, second, third] },
    });
    expect(error, error?.message).toBeFalsy();

    // Exactly one session_booked log across all three sessions, and it's
    // against the earliest one (the function's anchor).
    const logs = dbQuery<{ session_id: string; status: string }>(
      `select session_id, status from public.email_logs
       where email_type = 'session_booked' and session_id in ('${first}', '${second}', '${third}');`,
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0].session_id).toBe(first);
    expect(logs[0].status).toBe("sent");

    // Client gets one notification: what was booked + a pay nudge (unpaid) +
    // a deep link to their sessions page.
    const clientNotifs = dbQuery<{ message: string; url: string | null }>(
      `select message, url from public.notifications where user_id = '${clientId}' and type = 'session_booked';`,
    ).rows;
    expect(clientNotifs).toHaveLength(1);
    expect(clientNotifs[0].message).toMatch(/3-session block/);
    expect(clientNotifs[0].message).toMatch(/pay/i);
    expect(clientNotifs[0].url).toBe("/my-sessions");

    // Admin gets ONE rich notification (with a deep link), and NOT the
    // generic "<client> was sent: session booked" one the email_logs trigger
    // emits for single bookings (suppressed for block rows).
    const adminNotifs = dbQuery<{ type: string; message: string; url: string | null }>(
      `select type, message, url from public.notifications where user_id = '${adminId}' and type in ('session_booked', 'email_sent');`,
    ).rows;
    expect(adminNotifs).toHaveLength(1);
    expect(adminNotifs[0].type).toBe("session_booked");
    expect(adminNotifs[0].message).toMatch(/3-session block/);
    expect(adminNotifs[0].message).not.toMatch(/was sent:/);
    expect(adminNotifs[0].url).toContain(`/admin/clients/${clientId}`);
  });

  test("respects disabled_email_types — one skipped log, still not one per session", async () => {
    test.setTimeout(90_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    await adminDb
      .from("practice_settings")
      .update({ disabled_email_types: ["session_booked"] })
      .eq("admin_id", adminId);

    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '125 hours' and now() + interval '129 hours';`,
    );

    const blockId = `e2e-blockmail-skip-${Date.now()}`;
    const { a, b } = insertSessions([
      {
        label: "a",
        clientId,
        adminId,
        scheduledAt: dayjs().add(126, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId, block_pos: 1, block_total: 2 },
      },
      {
        label: "b",
        clientId,
        adminId,
        scheduledAt: dayjs().add(127, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId, block_pos: 2, block_total: 2 },
      },
    ]);

    const { error } = await adminDb.functions.invoke("notify-block-booked", {
      body: { session_ids: [a, b] },
    });
    expect(error, error?.message).toBeFalsy();

    const logs = dbQuery<{ session_id: string; status: string }>(
      `select session_id, status from public.email_logs
       where email_type = 'session_booked' and session_id in ('${a}', '${b}');`,
    ).rows;
    expect(logs).toHaveLength(1);
    expect(logs[0].session_id).toBe(a);
    expect(logs[0].status).toBe("skipped");

    await adminDb.from("practice_settings").update({ disabled_email_types: [] }).eq("admin_id", adminId);
  });
});

// ── Manual payment decline + retry ──────────────────────────────────────────
//
// respond_manual_payment()'s decline branch sets manual_payment_status to
// 'declined' — request_manual_payment()'s own eligibility guard used to
// require exactly 'none', which permanently blocked ever re-requesting bank
// transfer payment after a single decline (20260821000001). Card/Stripe
// payment was never affected (it doesn't check this column at all), and an
// admin could always mark a session paid directly — but the "fix the
// reference and try the transfer again" path was a dead end until this fix.

test.describe("Manual payment decline and retry", () => {
  test("a declined manual payment request can be re-requested, staying consistent across the block", async () => {
    test.setTimeout(90_000);
    const { adminId, clientId } = lookupFixtureIds(FIXTURES.admin.email, FIXTURES.client.email);
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);
    const clientDb = await signIn(FIXTURES.client.email, FIXTURES.client.password);

    dbQuery(
      `delete from public.sessions where created_by = '${adminId}' and scheduled_at between now() + interval '109 hours' and now() + interval '112 hours';`,
    );

    const blockId = `e2e-retryblock-${Date.now()}`;
    const { first, second } = insertSessions([
      {
        label: "first",
        clientId,
        adminId,
        scheduledAt: dayjs().add(109, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
      {
        label: "second",
        clientId,
        adminId,
        scheduledAt: dayjs().add(110, "hour").toISOString(),
        paid: false,
        metadata: { block_id: blockId },
      },
    ]);

    const statusesOf = (ids: string[]) =>
      dbQuery<{ id: string; manual_payment_status: string; paid: boolean }>(
        `select id, manual_payment_status, paid from public.sessions where id in (${ids.map((id) => `'${id}'`).join(",")});`,
      ).rows;

    const { error: requestErr } = await clientDb.rpc("request_manual_payment", { p_session_id: first });
    expect(requestErr, requestErr?.message).toBeFalsy();
    for (const row of statusesOf([first, second])) expect(row.manual_payment_status).toBe("pending");

    const { error: declineErr } = await adminDb.rpc("respond_manual_payment", {
      p_session_id: first,
      p_approved: false,
    });
    expect(declineErr, declineErr?.message).toBeFalsy();
    for (const row of statusesOf([first, second])) expect(row.manual_payment_status).toBe("declined");

    // This call used to fail with "Session not found, already paid, or
    // manual payment already requested" — that's the bug this test exists
    // to catch a regression of.
    const { error: retryErr } = await clientDb.rpc("request_manual_payment", { p_session_id: first });
    expect(retryErr, "retrying after a decline should succeed, not stay permanently blocked").toBeFalsy();
    for (const row of statusesOf([first, second])) expect(row.manual_payment_status).toBe("pending");

    const { error: approveErr } = await adminDb.rpc("respond_manual_payment", {
      p_session_id: first,
      p_approved: true,
    });
    expect(approveErr, approveErr?.message).toBeFalsy();
    for (const row of statusesOf([first, second])) {
      expect(row.manual_payment_status).toBe("approved");
      expect(row.paid).toBe(true);
    }
  });
});
