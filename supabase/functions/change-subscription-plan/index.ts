import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

// Self-serve tier switch for an EXISTING subscriber (the in-app
// Settings -> Subscription screen). New subscribers still go through
// create-subscription-checkout; card / cancel / invoices stay in the
// Stripe billing portal.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Plan = "starter" | "growth" | "unlimited";
type Billing = "monthly" | "annual";

const PLANS: Plan[] = ["starter", "growth", "unlimited"];

function getPriceId(plan: Plan, billing: Billing): string {
  const key = `${plan}${billing === "annual" ? "_annual" : ""}`;
  const envKeys: Record<string, string> = {
    starter: "STRIPE_PRICE_STARTER",
    growth: "STRIPE_PRICE_GROWTH",
    unlimited: "STRIPE_PRICE_UNLIMITED",
    starter_annual: "STRIPE_PRICE_STARTER_ANNUAL",
    growth_annual: "STRIPE_PRICE_GROWTH_ANNUAL",
    unlimited_annual: "STRIPE_PRICE_UNLIMITED_ANNUAL",
  };
  const envKey = envKeys[key];
  const id = envKey ? Deno.env.get(envKey) : undefined;
  if (!id) throw new Error(`Missing Stripe price ID: ${envKey ?? key}`);
  return id;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return json({ error: "Forbidden" }, 403);

    // ── Parse + validate the requested plan ──────────────────────────────
    let plan: Plan | null = null;
    let billing: Billing = "monthly";
    try {
      const body = await req.json();
      if (body?.plan && PLANS.includes(body.plan)) plan = body.plan;
      if (body?.billing === "annual") billing = "annual";
    } catch {
      /* fall through to the null check below */
    }
    if (!plan) return json({ error: "Invalid plan" }, 400);

    // ── Capacity gate: can this practice fit inside the target tier? ─────
    const { data: check, error: checkErr } = await supabase.rpc("plan_change_check", { p_target: plan });
    if (checkErr) throw new Error(`plan_change_check failed: ${checkErr.message}`);
    if (!check?.ok) {
      // Frontend renders "archive N clients before downgrading".
      return json({ error: "PLAN_LIMIT", detail: check }, 409);
    }

    // ── Locate the live Stripe subscription ─────────────────────────────
    const { data: settings } = await supabase
      .from("practice_settings")
      .select("stripe_subscription_id, subscription_status")
      .eq("admin_id", user.id)
      .single();

    const subId = settings?.stripe_subscription_id;
    if (!subId) {
      return json({ error: "No active subscription — use checkout to subscribe first." }, 422);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const newPriceId = getPriceId(plan, billing);

    const sub = await stripe.subscriptions.retrieve(subId);
    const currentItem = sub.items.data[0];
    if (!currentItem) throw new Error("Subscription has no line items");

    if (currentItem.price.id === newPriceId) {
      return json({ ok: true, plan, billing, unchanged: true });
    }

    await stripe.subscriptions.update(subId, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
      metadata: { ...sub.metadata, admin_id: user.id, plan, billing },
    });

    // Optimistic local write; the customer.subscription.updated webhook is the
    // source of truth and will re-affirm this.
    await supabase
      .from("practice_settings")
      .update({ subscription_plan: plan, billing_interval: billing === "annual" ? "year" : "month" })
      .eq("admin_id", user.id);

    return json({ ok: true, plan, billing });
  } catch (err) {
    console.error("change-subscription-plan ERROR:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
