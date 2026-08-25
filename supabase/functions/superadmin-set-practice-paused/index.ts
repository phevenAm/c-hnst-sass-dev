import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Pausing makes the practice read-only in-app (block_paused_write trigger,
// see 20260826000000_practice_pause.sql) AND pauses Stripe billing —
// charging for an account you've made read-only doesn't make sense, so the
// two always move together. behavior: "void" means Stripe simply stops
// generating invoices for the paused period rather than drafting or marking
// them uncollectible; resuming clears pause_collection and billing resumes
// on the subscription's normal cycle.
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

    const { data: caller } = await supabase.from("users").select("is_superadmin").eq("id", user.id).single();
    if (!caller?.is_superadmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { admin_id, paused, reason } = await req.json();
    if (!admin_id || typeof paused !== "boolean") {
      return new Response(JSON.stringify({ error: "admin_id and paused (boolean) are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("practice_settings")
      .select("stripe_subscription_id")
      .eq("admin_id", admin_id)
      .single();
    if (settingsError) throw new Error(settingsError.message);

    const stripeErrors: string[] = [];
    if (settings?.stripe_subscription_id) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
      try {
        await stripe.subscriptions.update(settings.stripe_subscription_id, {
          pause_collection: paused ? { behavior: "void" } : null,
        });
      } catch (err: any) {
        // Don't let a Stripe hiccup block the in-app read-only lock — that
        // half is the more urgent one if this is being used to shut down
        // abuse. Report the failure back so the superadmin knows billing
        // wasn't touched and can check Stripe directly.
        stripeErrors.push(err.message);
      }
    }

    const { error: updateError } = await supabase
      .from("practice_settings")
      .update({
        is_paused: paused,
        paused_at: paused ? new Date().toISOString() : null,
        paused_reason: paused ? (reason ?? null) : null,
      })
      .eq("admin_id", admin_id);
    if (updateError) throw new Error(updateError.message);

    return new Response(JSON.stringify({ success: true, stripeErrors }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
