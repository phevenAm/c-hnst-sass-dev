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

    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

    const isAdmin = profile?.role === "admin";

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    if (!isAdmin && session.client_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Issue refund if the session was paid via Stripe and cancellation falls
    // outside the practice's configured cutoff window (Settings → Practice →
    // Reschedule & cancellation cutoff). No cutoff configured (null) means no
    // time restriction — always eligible. Inside the cutoff — no refund.
    let refundIssuedPence: number | null = null;
    let refundSkippedReason: "not_stripe_payment" | "within_cutoff" | null = null;

    if (session.paid && session.stripe_payment_intent_id) {
      const { data: practiceSettings } = await supabase
        .from("practice_settings")
        .select("reschedule_cutoff_hours")
        .eq("admin_id", session.created_by)
        .maybeSingle();

      const cutoffHours = practiceSettings?.reschedule_cutoff_hours ?? null;
      const msUntilSession = new Date(session.scheduled_at).getTime() - Date.now();
      const outsideCutoff = cutoffHours === null || msUntilSession > cutoffHours * 60 * 60 * 1000;

      if (outsideCutoff) {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
          apiVersion: "2024-06-20",
        });
        await stripe.refunds.create({
          payment_intent: session.stripe_payment_intent_id,
          amount: session.price_pence,
        });
        refundIssuedPence = session.price_pence;
      } else {
        refundSkippedReason = "within_cutoff";
      }
    } else if (session.paid) {
      // Paid but not via Stripe (bank transfer/manual) — nothing to refund automatically.
      refundSkippedReason = "not_stripe_payment";
    }

    await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session_id);

    return new Response(
      JSON.stringify({
        ok: true,
        refunded: refundIssuedPence !== null,
        refund_amount_pence: refundIssuedPence,
        refund_skipped_reason: refundSkippedReason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
