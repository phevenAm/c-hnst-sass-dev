import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

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

    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { data: settings } = await supabase
      .from("practice_settings")
      .select("stripe_connect_account_id")
      .eq("admin_id", user.id)
      .single();

    const connectClientId = Deno.env.get("STRIPE_CONNECT_CLIENT_ID");

    // Best-effort revoke on Stripe's side — if it fails, or the
    // STRIPE_CONNECT_CLIENT_ID secret isn't set, we still drop our own copy
    // below so the admin isn't stuck either way. Without this revoke the
    // OAuth grant itself stays live on Stripe's side even though the app no
    // longer shows the account as connected.
    if (settings?.stripe_connect_account_id && connectClientId) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
      await stripe.oauth
        .deauthorize({ client_id: connectClientId, stripe_user_id: settings.stripe_connect_account_id })
        .catch(() => undefined);
    }

    // card_payments_enabled must go too — leaving it on with no connected
    // account would let a client hit "Pay with Stripe" straight into an error.
    await supabase
      .from("practice_settings")
      .update({ stripe_connect_account_id: null, stripe_connect_onboarded: false, card_payments_enabled: false })
      .eq("admin_id", user.id);

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
