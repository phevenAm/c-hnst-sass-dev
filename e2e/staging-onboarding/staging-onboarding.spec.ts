// The one flow that had never been run end-to-end as a single sweep on
// staging: a brand-new counsellor signs up (CounsellorSignupPage, /register),
// confirms their email, logs in, gets forced onto /subscribe by
// SubscriptionGate, completes a real Stripe test-mode checkout, and the
// webhook + AdminSetupGate should land them on /admin/setup with a clean
// dashboard underneath. Screenshots are taken at each stage so the run can be
// eyeballed afterwards, not just trusted on assertion text.
//
// Email confirmation itself is done via a direct DB update (same trick
// e2e/settings/db.ts's createAuthUser uses at creation time) rather than
// waiting on a real inbox — Supabase's own confirmation-link mechanism isn't
// this app's code to re-verify every run; what this spec actually exercises
// is everything downstream of confirmation that IS this app's code: login,
// SubscriptionGate, the real Stripe Checkout redirect, the webhook flipping
// practice_settings, and AdminSetupGate.
import { expect, test } from "@playwright/test";

import { APP_URL, PASSWORD, testEmail } from "./constants";
import { createConfirmedStagingAdmin, stagingDbQuery } from "./db";

test.describe.configure({ mode: "serial" });

function cleanupEmail(email: string) {
  // Cascades to public.users/practice_settings aren't automatic on this
  // schema (see the staging test-account incident this session) — clean up
  // all three explicitly so reruns never collide on the same email.
  stagingDbQuery(`
    delete from public.practice_settings where admin_id = (select id from auth.users where email = '${email}');
    delete from public.users where id = (select id from auth.users where email = '${email}');
    delete from auth.users where email = '${email}';
  `);
}

let createdEmail = "";

test.afterAll(() => {
  if (createdEmail) cleanupEmail(createdEmail);
});

test("sign up -> confirm email -> subscribe -> admin/setup, in one sweep", async ({ page }) => {
  test.setTimeout(150_000);
  const email = testEmail("full");
  createdEmail = email;

  await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));

  // ── 1. Sign up ──────────────────────────────────────────────────────────
  await page.goto(`${APP_URL}/register`, { waitUntil: "load", timeout: 30_000 });
  await page.locator("#firstName").fill("E2E");
  await page.locator("#lastName").fill("Onboard");
  await page.locator("#practiceName").fill("E2E Test Practice");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#confirm").fill(PASSWORD);
  await page.screenshot({ path: "test-results/staging-onboard-1-account-form.png" });
  await page.getByRole("button", { name: "Create account" }).click();

  // The static helper paragraph under the form ("Check your email for a
  // confirmation link — once confirmed, pick a plan.") also matches a loose
  // /check your email/i text search, so target the done-screen's actual h2
  // heading specifically — otherwise this assertion passes on the form
  // itself, mid-submit, before the real confirmation screen ever renders.
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/We've sent a confirmation link to/i)).toBeVisible();
  await page.screenshot({ path: "test-results/staging-onboard-2-check-email.png" });

  // Confirm exists as a real, unconfirmed auth user before "confirming" it.
  const created = stagingDbQuery<{ id: string; email_confirmed_at: string | null }>(
    `select id, email_confirmed_at from auth.users where email = '${email}';`,
  ).rows[0];
  expect(created, "signUp() did not create an auth.users row").toBeTruthy();
  expect(created.email_confirmed_at, "account was already confirmed before the confirm step ran").toBeNull();

  // ── 2. Confirm email ────────────────────────────────────────────────────
  stagingDbQuery(`update auth.users set email_confirmed_at = now() where email = '${email}';`);
  const confirmed = stagingDbQuery<{ email_confirmed_at: string | null }>(
    `select email_confirmed_at from auth.users where email = '${email}';`,
  ).rows[0];
  expect(confirmed.email_confirmed_at, "confirmation update didn't stick").not.toBeNull();

  // ── 3. Log in ────────────────────────────────────────────────────────────
  await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 30_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.click('button[type="submit"]');

  // A freshly-confirmed, never-subscribed admin should be bounced straight
  // to /subscribe by SubscriptionGate — this is the exact hop that was
  // 400-ing on plan_change_check before the plan_limits reseed.
  await page.waitForURL((u) => u.pathname === "/subscribe", { timeout: 20_000 });
  // waitForURL resolves the instant the URL changes, which on this route is
  // before SubscriptionGate/AgencyBootstrap finish loading and the page
  // actually paints — screenshot right after waitForURL alone just captures
  // the splash. Wait for real content first.
  const termsButton = page.getByRole("button", { name: /Read & accept Terms/i });
  await termsButton.waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: "test-results/staging-onboard-3-subscribe-page.png" });

  const planCheckErrors = consoleErrors.filter((e) => e.includes("plan_change_check"));
  expect(planCheckErrors, `console errors: ${planCheckErrors.join("; ")}`).toHaveLength(0);

  // ── 4. Accept terms, subscribe (starter/monthly, both already default) ──
  await termsButton.click();
  await page.getByRole("button", { name: /I agree — continue to payment/i }).click();

  await page.getByRole("button", { name: /Start subscription/i }).click();
  await page.waitForURL((u) => u.hostname.includes("checkout.stripe.com"), { timeout: 30_000 });
  await page.waitForSelector("#cardNumber", { timeout: 20_000 });
  await page.screenshot({ path: "test-results/staging-onboard-4-stripe-checkout.png" });

  // ── 5. Pay with Stripe's test card ──────────────────────────────────────
  await page.fill("#cardNumber", "4242424242424242");
  await page.fill("#cardExpiry", "12/30");
  await page.fill("#cardCvc", "123");
  const billingName = page.locator("#billingName");
  if (await billingName.isVisible().catch(() => false)) await billingName.fill("E2E Onboard");
  const billingPostalCode = page.locator("#billingPostalCode");
  if (await billingPostalCode.isVisible().catch(() => false)) await billingPostalCode.fill("SW1A 1AA");

  await page.click('[data-testid="hosted-payment-submit-button"]');
  await page.waitForURL((u) => !u.hostname.includes("stripe.com"), { timeout: 30_000 });

  // ── 6. Land on the post-checkout /admin/welcome interstitial ────────────
  await page.waitForURL((u) => u.pathname === "/admin/welcome", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Thank you for subscribing to Clarity" })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: "test-results/staging-onboard-5-welcome.png" });

  const settings = await pollUntilActive(email);
  expect(settings?.subscription_status).toBe("active");
  expect(settings?.subscription_plan).toBe("starter");
  expect(settings?.onboarding_required).toBe(true);

  // ── 7. "Get started" -> AdminSetupGate's real onboarding wizard ─────────
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForURL((u) => u.pathname === "/admin/setup", { timeout: 20_000 });
  await page.getByRole("heading", { level: 2 }).first().waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: "test-results/staging-onboard-6-admin-setup.png" });
});

// The test above proved the whole journey once already (including this
// half), but a rerun taken specifically to fix screenshot timing tripped
// Supabase's own auth email-send rate limit (2/hour, hit signUp() twice
// back to back) — the "Check your email" screen never rendered on that
// rerun because signUp() itself failed, correctly reflecting that real
// constraint rather than an app bug. This test re-covers everything
// downstream of email confirmation — login, SubscriptionGate, the real
// Stripe Checkout, the webhook, AdminSetupGate — via a directly-inserted,
// already-confirmed admin instead of signUp(), so it never touches the rate
// limit and can be rerun freely to get clean screenshots.
test("confirmed admin -> subscribe -> Stripe checkout -> admin/setup", async ({ page }) => {
  test.setTimeout(120_000);
  const email = testEmail("backhalf");
  createConfirmedStagingAdmin({ email, password: PASSWORD });

  try {
    await page.addInitScript(() => localStorage.setItem("walkthrough_globally_dismissed", "true"));

    await page.goto(`${APP_URL}/login`, { waitUntil: "load", timeout: 30_000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.click('button[type="submit"]');

    await page.waitForURL((u) => u.pathname === "/subscribe", { timeout: 20_000 });
    const termsButton = page.getByRole("button", { name: /Read & accept Terms/i });
    await termsButton.waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({ path: "test-results/staging-onboard-3-subscribe-page.png" });

    const planCheckErrors = consoleErrors.filter((e) => e.includes("plan_change_check"));
    expect(planCheckErrors, `console errors: ${planCheckErrors.join("; ")}`).toHaveLength(0);

    await termsButton.click();
    await page.getByRole("button", { name: /I agree — continue to payment/i }).click();

    await page.getByRole("button", { name: /Start subscription/i }).click();
    await page.waitForURL((u) => u.hostname.includes("checkout.stripe.com"), { timeout: 30_000 });
    await page.waitForSelector("#cardNumber", { timeout: 20_000 });
    await page.screenshot({ path: "test-results/staging-onboard-4-stripe-checkout.png" });

    await page.fill("#cardNumber", "4242424242424242");
    await page.fill("#cardExpiry", "12/30");
    await page.fill("#cardCvc", "123");
    const billingName = page.locator("#billingName");
    if (await billingName.isVisible().catch(() => false)) await billingName.fill("E2E Onboard");
    const billingPostalCode = page.locator("#billingPostalCode");
    if (await billingPostalCode.isVisible().catch(() => false)) await billingPostalCode.fill("SW1A 1AA");

    await page.click('[data-testid="hosted-payment-submit-button"]');
    await page.waitForURL((u) => !u.hostname.includes("stripe.com"), { timeout: 30_000 });

    await page.waitForURL((u) => u.pathname === "/admin/welcome", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Thank you for subscribing to Clarity" })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: "test-results/staging-onboard-5-welcome.png" });

    const settings = await pollUntilActive(email);
    expect(settings?.subscription_status).toBe("active");
    expect(settings?.subscription_plan).toBe("starter");
    expect(settings?.onboarding_required).toBe(true);

    await page.getByRole("button", { name: "Get started" }).click();
    await page.waitForURL((u) => u.pathname === "/admin/setup", { timeout: 20_000 });
    await page.getByRole("heading", { level: 2 }).first().waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({ path: "test-results/staging-onboard-6-admin-setup.png" });
  } finally {
    cleanupEmail(email);
  }
});

async function pollUntilActive(email: string, timeoutMs = 20_000) {
  const start = Date.now();
  for (;;) {
    const row = stagingDbQuery<{
      subscription_status: string | null;
      subscription_plan: string | null;
      onboarding_required: boolean | null;
    }>(
      `select ps.subscription_status, ps.subscription_plan, ps.onboarding_required
       from public.practice_settings ps
       join auth.users u on u.id = ps.admin_id
       where u.email = '${email}';`,
    ).rows[0];
    if (row?.subscription_status === "active") return row;
    if (Date.now() - start > timeoutMs) return row;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
