import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

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

  if (!envKey) {
    throw new Error(`No environment variable configured for ${key}`);
  }

  const id = Deno.env.get(envKey);

  if (!id) {
    throw new Error(`Missing Stripe price ID: ${envKey}`);
  }

  console.log(`Using Stripe price: ${envKey} (${id})`);

  return id;
}

Deno.serve(async (req) => {
  console.log("create-subscription-checkout request:", req.method);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.error("Missing Authorization header");

      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      console.error("Supabase auth error:", authError);

      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    console.log("Authenticated user:", user.id);

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, first_name, last_name")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Profile lookup error:", profileError);
    }

    if (profile?.role !== "admin") {
      console.error("User is not an admin:", user.id);

      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    let plan: Plan = "starter";
    let billing: Billing = "monthly";
    let referralCode: string | null = null;

    try {
      const body = await req.json();

      if (body?.plan && PLANS.includes(body.plan)) {
        plan = body.plan as Plan;
      }

      if (body?.billing === "annual") {
        billing = "annual";
      }

      if (body?.referral_code && typeof body.referral_code === "string") {
        referralCode = body.referral_code.trim().toUpperCase();
      }
    } catch {
      console.log("No valid request body; using defaults");
    }

    console.log("Subscription request:", {
      plan,
      billing,
      hasReferralCode: !!referralCode,
    });

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    const stripe = new Stripe(stripeSecretKey);

    const priceId = getPriceId(plan, billing);

    const { data: settings, error: settingsError } = await supabase
      .from("practice_settings")
      .select("billing_customer_id")
      .eq("admin_id", user.id)
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      console.error("Settings lookup error:", settingsError);
    }

    let billingCustomerId = settings?.billing_customer_id ?? null;

    if (!billingCustomerId) {
      console.log("Creating Stripe customer");

      const customer = await stripe.customers.create({
        email: user.email,
        name: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : undefined,
        metadata: {
          admin_id: user.id,
        },
      });

      billingCustomerId = customer.id;

      console.log("Created Stripe customer:", billingCustomerId);

      // Upsert so the row is created if the DB trigger missed it
      const { error: updateError } = await supabase
        .from("practice_settings")
        .upsert({ admin_id: user.id, billing_customer_id: billingCustomerId }, { onConflict: "admin_id" });

      if (updateError) {
        console.error("Failed to save Stripe customer ID:", updateError);

        throw new Error(`Failed to save Stripe customer ID: ${updateError.message}`);
      }
    } else {
      console.log("Using existing Stripe customer:", billingCustomerId);
    }

    const appUrl = Deno.env.get("APP_URL");

    if (!appUrl) {
      throw new Error("Missing APP_URL");
    }

    const cleanAppUrl = appUrl.replace(/\/$/, "");

    console.log("Creating Stripe Checkout session");
    console.log("Price:", priceId);
    console.log("Success URL:", `${cleanAppUrl}/admin?subscribed=true`);
    console.log("Cancel URL:", `${cleanAppUrl}/subscribe`);

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: billingCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${cleanAppUrl}/admin?subscribed=true`,
      cancel_url: `${cleanAppUrl}/subscribe`,
      metadata: {
        admin_id: user.id,
        plan,
        billing,
        ...(referralCode ? { referral_code: referralCode } : {}),
      },
    });

    console.log("Checkout session created:", checkoutSession.id);

    return new Response(
      JSON.stringify({
        url: checkoutSession.url,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err: unknown) {
    console.error("create-subscription-checkout ERROR:", err);

    const message = err instanceof Error ? err.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
