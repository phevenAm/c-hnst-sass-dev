// Regression for "plan_change_check failed: Not authenticated" — the
// change-subscription-plan edge function used a service-role-only Supabase
// client to call plan_change_check(), a SECURITY DEFINER fn that reads
// auth.uid(). With no user context auth.uid() is null and it threw, 500ing
// the whole switch-plan action. Fixed by calling that RPC on a JWT-scoped
// client.
//
// This exercises the DEPLOYED function, so it only passes once
// `supabase functions deploy change-subscription-plan` has run.
//
// Prereq: `node e2e/settings/seed-fixtures.mjs` (fixture admin ends up
// subscription_status='active' with no real Stripe subscription).

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { FIXTURES, SUPABASE_ANON_KEY, SUPABASE_URL } from "../settings/constants";

test.describe.configure({ mode: "serial" });

test("unauthenticated call is rejected with 401, not a 500", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/change-subscription-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ plan: "growth" }),
  });
  expect(res.status).toBe(401);
});

test("an authenticated admin gets past plan_change_check (no 'Not authenticated')", async () => {
  test.setTimeout(60_000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: FIXTURES.admin.email,
    password: FIXTURES.admin.password,
  });
  expect(signInErr, signInErr?.message).toBeFalsy();

  const { data, error } = await supabase.functions.invoke("change-subscription-plan", {
    body: { plan: "growth" },
  });

  // The capacity gate ran fine; the request now falls through to the Stripe
  // subscription lookup, which the fixture admin doesn't have. That 422 is the
  // proof plan_change_check succeeded.
  const detail = (error as { context?: Response })?.context;
  const body = data ?? (detail ? await detail.json().catch(() => ({})) : {});
  const message: string = body?.error ?? error?.message ?? "";

  expect(message).not.toMatch(/Not authenticated/i);
  expect(message).not.toMatch(/plan_change_check failed/i);
  // and it's the expected "no subscription yet" outcome, not a 500
  expect(message).toMatch(/No active subscription|use checkout/i);
});
