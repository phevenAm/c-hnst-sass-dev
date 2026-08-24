import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Called from DeleteUserModal before delete_own_account() — that RPC deletes
// practice_settings (which holds billing_customer_id/stripe_subscription_id)
// with no Stripe awareness at all, so without this step Stripe just keeps
// billing a deleted account forever with no record left to trace it to.
// Only relevant for admins (clients have no billing_customer_id); the caller
// is expected to skip calling this for a client account.
//
// Best-effort like disconnect-stripe: a Stripe API failure here is reported
// back but doesn't throw, so the caller can decide whether to still let the
// admin proceed with deletion (rather than getting stuck unable to delete
// their account because of a transient Stripe error).
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
      return new Response(JSON.stringify({ error: "Forbidden — this is only relevant for admin accounts" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { data: settings } = await supabase
      .from("practice_settings")
      .select("stripe_subscription_id, stripe_connect_account_id")
      .eq("admin_id", user.id)
      .single();

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const errors: string[] = [];

    if (settings?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(settings.stripe_subscription_id);
      } catch (err: any) {
        // Already-canceled subscriptions 404/400 on a second cancel — not a
        // real failure, nothing left to do.
        if (err?.code !== "resource_missing") errors.push(`subscription: ${err.message}`);
      }
    }

    const connectClientId = Deno.env.get("STRIPE_CONNECT_CLIENT_ID");
    if (settings?.stripe_connect_account_id && connectClientId) {
      try {
        await stripe.oauth.deauthorize({
          client_id: connectClientId,
          stripe_user_id: settings.stripe_connect_account_id,
        });
      } catch (err: any) {
        errors.push(`connect: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({ success: errors.length === 0, errors }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
