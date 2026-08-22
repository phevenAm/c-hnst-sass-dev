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

    // issue_refund is only meaningful when the caller is the admin — it's the
    // explicit, in-the-moment choice made in the cancel dialog (e.g. "no,
    // this client was a no-show despite paying, don't refund them" even
    // though the cutoff window would otherwise suggest one). It's never
    // inferred automatically.
    const { session_id, issue_refund } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

    const isAdmin = profile?.role === "admin";

    // Clients no longer cancel directly — a client-initiated cancel goes
    // through request-cancel-session (cancellation_requests) and the admin
    // performs the actual cancellation from here, deciding the refund at the
    // same time via issue_refund. Only admins reach this point now.
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    if (session.created_by !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const canRefund = session.paid && !!session.stripe_payment_intent_id;

    let refundIssued = false;
    let refundSkippedReason: "not_stripe_payment" | "admin_declined" | null = null;

    if (canRefund) {
      // Admin is cancelling right now (either directly, or approving a
      // client's cancellation_requests) and explicitly said yes/no in the
      // dialog — that decision IS the approval, so issue it immediately.
      if (issue_refund) {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
        await stripe.refunds.create({
          payment_intent: session.stripe_payment_intent_id,
          amount: session.price_pence,
        });
        await supabase.from("sessions").update({ paid: false }).eq("id", session_id);
        refundIssued = true;
        // Client notification is handled centrally by stripe-webhook's
        // charge.refunded handler — that's the only path that also catches
        // refunds an admin issues directly from the Stripe dashboard, so
        // notifying here too would either duplicate it or drift out of sync.
      } else {
        refundSkippedReason = "admin_declined";
      }
    } else if (session.paid) {
      // Paid but not via Stripe (bank transfer/manual) — no automated refund path.
      refundSkippedReason = "not_stripe_payment";
    }

    await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session_id);

    // If this cancellation is fulfilling a pending client request, close it out.
    await supabase
      .from("cancellation_requests")
      .update({ status: "accepted" })
      .eq("session_id", session_id)
      .eq("status", "pending");

    return new Response(
      JSON.stringify({
        ok: true,
        refund_issued: refundIssued,
        refund_amount_pence: refundIssued ? session.price_pence : null,
        refund_skipped_reason: refundSkippedReason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
