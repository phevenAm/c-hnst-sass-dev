// Real end-to-end Stripe tests — test mode only. These hit the actual
// deployed edge functions, the actual Stripe test-mode Checkout page (with
// Stripe's 4242 test card), and verify state by reading back what the real
// webhook wrote to Supabase. Nothing here is mocked.
//
// Requires fixtures created once via `node e2e/stripe/seed-fixtures.mjs`
// (see that file for what it sets up and why). Run against the deployed
// app/functions — no local dev server required, since Stripe Checkout and
// the webhook only talk to the real deployed backend either way.
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { APP_URL, FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "./constants";

function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function signIn(email: string, password: string) {
  const supabase = freshClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return supabase;
}

async function payOnStripeCheckout(page: Page, checkoutUrl: string) {
  await page.goto(checkoutUrl, { waitUntil: "load", timeout: 45000 });
  await page.waitForSelector("#cardNumber", { timeout: 20000 });

  // Subscription checkout pre-attaches a Stripe customer, so it never shows
  // an email field; direct/session checkout (no customer attached) does and
  // requires it — fill in whatever this particular checkout actually shows.
  const email = page.locator("#email");
  if (await email.isVisible().catch(() => false)) {
    await email.fill("e2e-stripe-test@clarity-e2e-test.dev");
  }

  await page.fill("#cardNumber", "4242424242424242");
  await page.fill("#cardExpiry", "12/30");
  await page.fill("#cardCvc", "123");
  const billingName = page.locator("#billingName");
  if (await billingName.isVisible().catch(() => false)) {
    await billingName.fill("E2E Test");
  }
  const billingPostalCode = page.locator("#billingPostalCode");
  if (await billingPostalCode.isVisible().catch(() => false)) {
    await billingPostalCode.fill("SW1A 1AA");
  }

  await page.click('[data-testid="hosted-payment-submit-button"]');
  await page.waitForURL((u) => !u.hostname.includes("stripe.com"), { timeout: 30000 });
}

async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 20000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() - start > timeoutMs) return value; // let the caller's assertion produce the failure message
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ── Platform subscription (admin subscribes to Clarity itself) ────────────
//
// Rerunning this against an already-active fixture admin is harmless: Stripe
// Checkout + the webhook just re-confirm the same active state. To test the
// inactive -> active transition freshly, reset the fixture first:
//   node e2e/stripe/seed-fixtures.mjs --reset

test.describe("Platform subscription checkout", () => {
  test("checkout completes and the webhook activates the account", async ({ page }) => {
    test.setTimeout(90_000);
    const supabase = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);

    const { data, error } = await supabase.functions.invoke("create-subscription-checkout", {
      body: { plan: "starter", billing: "monthly" },
    });
    expect(error, error?.message).toBeFalsy();
    expect(data?.url).toContain("checkout.stripe.com");

    // This browser context never logs into the app itself (auth happens via
    // a separate supabase-js client above), so the post-payment landing page
    // isn't a reliable thing to assert on — the SPA has no session here and
    // will bounce to /login regardless of whether the payment succeeded.
    // What actually proves success is the DB state the webhook writes below.
    await payOnStripeCheckout(page, data.url);

    const settings = await pollUntil(
      async () => {
        const { data } = await supabase
          .from("practice_settings")
          .select("subscription_status, subscription_plan, billing_customer_id, stripe_subscription_id")
          .single();
        return data;
      },
      (s) => s?.subscription_status === "active",
    );

    expect(settings?.subscription_status).toBe("active");
    expect(settings?.subscription_plan).toBe("starter");
    expect(settings?.billing_customer_id).toBeTruthy();
    expect(settings?.stripe_subscription_id).toBeTruthy();
  });

  test("billing portal session can be created for an active subscriber", async () => {
    const supabase = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);
    const { data, error } = await supabase.functions.invoke("create-billing-portal-session");
    expect(error, error?.message).toBeFalsy();
    expect(data?.url).toContain("billing.stripe.com");
  });
});

// ── Auth guards — cheap, no Stripe interaction needed ──────────────────────

test.describe("Edge function auth guards", () => {
  test("create-subscription-checkout rejects unauthenticated requests", async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-subscription-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ plan: "starter", billing: "monthly" }),
    });
    expect(res.status).toBe(401);
  });

  test("create-subscription-checkout rejects a non-admin (client) caller", async () => {
    const supabase = await signIn(FIXTURES.client.email, FIXTURES.client.password);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-subscription-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ plan: "starter", billing: "monthly" }),
    });
    expect(res.status).toBe(403);
  });
});

// ── Stripe Connect: client pays counsellor directly, then admin refunds ───
//
// BLOCKED as of 2026-08-19: Stripe's Connect OAuth app doesn't have
// `${APP_URL}/settings/stripe-callback` in its allowed redirect URIs, so the
// onboarding step below fails with "Invalid redirect URI" before any of
// this can run. Add the URI in the Stripe Dashboard (Connect settings ->
// OAuth settings) and these tests should start passing.

test.describe("Stripe Connect — session payment and refund", () => {
  test.describe.configure({ mode: "serial" });

  test("admin can complete Stripe Connect onboarding", async ({ page }) => {
    test.setTimeout(60_000);
    const supabase = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);
    const { data: settings } = await supabase.from("practice_settings").select("stripe_connect_onboarded").single();

    if (settings?.stripe_connect_onboarded) {
      test.skip(true, "fixture admin is already Connect-onboarded");
      return;
    }

    await page.goto(`${APP_URL}/login`, { waitUntil: "load" });
    await page.fill('input[type="email"]', FIXTURES.admin.email);
    await page.fill('input[type="password"]', FIXTURES.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });

    await page.goto(`${APP_URL}/settings`, { waitUntil: "load" });

    // First-run admins get stacked onboarding modals ("Personalize your
    // account" then a walkthrough offer) that mount asynchronously — each
    // can take several seconds to appear after the profile fetch resolves.
    // Dismiss up to two of them in sequence, waiting generously for each.
    for (let i = 0; i < 2; i++) {
      const dialog = page.locator('[role="dialog"]').first();
      const appeared = await dialog
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!appeared) break;
      const dismissBtn = dialog
        .locator('button:has-text("Save"), button:has-text("No thanks"), button:has-text("Skip")')
        .first();
      await dismissBtn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // "Connect Stripe account" lives under the Practice tab, not the
    // Profile tab Settings opens on by default.
    await page.click('button:has-text("Practice")');
    await page.click('button:has-text("Connect Stripe account")');

    // Stripe's test-mode OAuth screen offers a one-click "skip" path for
    // connecting a fresh test account — no real business details needed.
    const skipLink = page.locator('a:has-text("Skip this form"), button:has-text("Skip this form")');
    await skipLink.click({ timeout: 15000 });

    // Lands on /settings/stripe-callback?code=... first, then the app
    // exchanges the code via the edge function before redirecting to the
    // final ?stripe=connected state — wait for that specifically, not just
    // any /settings path, or this resolves on the intermediate one.
    await page.waitForURL((u) => u.searchParams.get("stripe") === "connected", { timeout: 20000 });
  });

  test("client can pay for a session and the webhook marks it paid", async ({ page }) => {
    test.setTimeout(90_000);
    const clientDb = await signIn(FIXTURES.client.email, FIXTURES.client.password);
    const { data: unpaidSession, error: sessionErr } = await clientDb
      .from("sessions")
      .select("id, price_pence")
      .eq("paid", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(sessionErr, sessionErr?.message).toBeFalsy();

    const { data, error } = await clientDb.functions.invoke("create-checkout-session", {
      body: { session_id: unpaidSession?.id },
    });
    expect(error, error?.message).toBeFalsy();
    expect(data?.url).toContain("checkout.stripe.com");

    await payOnStripeCheckout(page, data.url);

    const paidSession = await pollUntil(
      async () => {
        const { data } = await clientDb
          .from("sessions")
          .select("paid, stripe_payment_intent_id")
          .eq("id", unpaidSession?.id)
          .single();
        return data;
      },
      (s) => s?.paid === true,
    );
    expect(paidSession?.paid).toBe(true);
    expect(paidSession?.stripe_payment_intent_id).toBeTruthy();
  });

  test("admin cancelling a paid session with a refund flips it back to unpaid", async () => {
    const adminDb = await signIn(FIXTURES.admin.email, FIXTURES.admin.password);
    const { data: paidSession, error: sessionErr } = await adminDb
      .from("sessions")
      .select("id")
      .eq("paid", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(sessionErr, sessionErr?.message).toBeFalsy();

    const {
      data: { session: authSession },
    } = await adminDb.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authSession?.access_token}`,
      },
      body: JSON.stringify({ session_id: paidSession?.id, issue_refund: true }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.refund_issued).toBe(true);

    const { data: cancelled } = await adminDb
      .from("sessions")
      .select("paid, status")
      .eq("id", paidSession?.id)
      .single();
    expect(cancelled?.paid).toBe(false);
    expect(cancelled?.status).toBe("cancelled");
  });
});
