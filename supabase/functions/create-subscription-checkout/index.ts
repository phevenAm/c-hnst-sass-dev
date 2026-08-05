import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Plan = "website" | "app" | "bundle";
type Billing = "monthly" | "annual";

function getPriceId(plan: Plan, billing: Billing): string {
  const key = `${plan}${billing === "annual" ? "_annual" : ""}`;
  const envKeys: Record<string, string> = {
    website: "STRIPE_PRICE_WEBSITE",
    app: "STRIPE_PRICE_APP",
    bundle: "STRIPE_PRICE_BUNDLE",
    website_annual: "STRIPE_PRICE_WEBSITE_ANNUAL",
    app_annual: "STRIPE_PRICE_APP_ANNUAL",
    bundle_annual: "STRIPE_PRICE_BUNDLE_ANNUAL",
  };
  const id = Deno.env.get(envKeys[key]);
  if (!id) throw new Error(`Missing Stripe price ID for plan: ${plan} (${billing})`);
  return id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Plan, billing period, and optional referral code from request body
    let plan: Plan = "app";
    let billing: Billing = "monthly";
    let referralCode: string | null = null;
    try {
      const body = await req.json();
      if (body?.plan && ["website", "app", "bundle"].includes(body.plan)) {
        plan = body.plan as Plan;
      }
      if (body?.billing === "annual") {
        billing = "annual";
      }
      if (body?.referral_code && typeof body.referral_code === "string") {
        referralCode = body.referral_code.trim().toUpperCase();
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

    const { data: settings } = await supabase
      .from("practice_settings")
      .select("billing_customer_id")
      .eq("admin_id", user.id)
      .single();

    let billingCustomerId = settings?.billing_customer_id ?? null;
    if (!billingCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : undefined,
        metadata: { admin_id: user.id },
      });
      billingCustomerId = customer.id;
      await supabase
        .from("practice_settings")
        .update({ billing_customer_id: billingCustomerId })
        .eq("admin_id", user.id);
    }

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: billingCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: getPriceId(plan, billing), quantity: 1 }],
      success_url: `${appUrl}/admin?subscribed=true`,
      cancel_url: `${appUrl}/subscribe`,
      metadata: { admin_id: user.id, plan, billing, ...(referralCode ? { referral_code: referralCode } : {}) },
    });

    return new Response(JSON.stringify({ url: checkoutSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
