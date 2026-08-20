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
