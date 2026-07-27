import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    if (session.client_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    if (session.paid) {
      return new Response(JSON.stringify({ error: "Session already paid" }), { status: 400, headers: corsHeaders });
    }

    // Fetch the counsellor's Stripe Connect account
    const { data: practiceSettings } = await supabase
      .from("practice_settings")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("admin_id", session.created_by)
      .single();

    if (!practiceSettings?.stripe_connect_onboarded || !practiceSettings?.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: "Your counsellor has not connected their Stripe account yet." }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    const connectAccountId = practiceSettings.stripe_connect_account_id;
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

    // Determine amount — block sessions charge for the whole block at once
    const meta = session.metadata as { block_id?: string; block_total?: number } | null;
    const blockId = meta?.block_id ?? null;

    let amountPence = session.price_pence;
    let description = "Counselling session";
    const checkoutMeta: Record<string, string> = { session_id };

    if (blockId) {
      const { data: blockSessions } = await supabase
        .from("sessions")
        .select("id, price_pence")
        .filter("metadata->>block_id", "eq", blockId);

      if (blockSessions && blockSessions.length > 0) {
        amountPence = blockSessions.reduce((sum: number, s: { price_pence: number }) => sum + (s.price_pence ?? 0), 0);
        description = `Counselling block (${blockSessions.length} sessions)`;
        checkoutMeta.block_id = blockId;
      }
    }

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    // Direct charge on the counsellor's connected account — money goes straight to them, 0% platform fee
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              unit_amount: amountPence,
              product_data: { name: description },
            },
            quantity: 1,
          },
        ],
        metadata: checkoutMeta,
        success_url: `${appUrl}/my-sessions?payment=success`,
        cancel_url: `${appUrl}/my-sessions?payment=cancelled`,
      },
      { stripeAccount: connectAccountId },
    );

    return new Response(JSON.stringify({ url: checkoutSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
