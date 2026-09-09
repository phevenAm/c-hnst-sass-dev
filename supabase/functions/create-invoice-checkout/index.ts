import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";

// Client-initiated Stripe Checkout for a whole invoice. Mirrors
// create-checkout-session (per-session payment): a direct charge on the
// practitioner's connected account, 0% platform fee. The webhook
// (checkout.session.completed, metadata.invoice_id) calls mark_invoice_paid_system.

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

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "Missing invoice_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, admin_id, client_id, status, total_pence, reference")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: corsHeaders });
    }
    if (invoice.client_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ error: "This invoice is already paid." }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (invoice.status !== "sent") {
      return new Response(JSON.stringify({ error: "This invoice can't be paid online." }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!invoice.total_pence || invoice.total_pence <= 0) {
      return new Response(JSON.stringify({ error: "This invoice has no amount to pay." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: ps } = await supabase
      .from("practice_settings")
      .select("stripe_connect_account_id, stripe_connect_onboarded, card_payments_enabled")
      .eq("admin_id", invoice.admin_id)
      .single();

    if (!ps?.stripe_connect_onboarded || !ps?.stripe_connect_account_id || !ps?.card_payments_enabled) {
      return new Response(
        JSON.stringify({
          error:
            "Card payment isn't available for this practice — pay by bank transfer using the details on your invoice.",
        }),
        { status: 422, headers: corsHeaders },
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              unit_amount: invoice.total_pence,
              product_data: { name: `Invoice ${invoice.reference}` },
            },
            quantity: 1,
          },
        ],
        metadata: { invoice_id: invoice.id },
        success_url: `${appUrl}/dashboard?payment=success`,
        cancel_url: `${appUrl}/dashboard?payment=cancelled`,
      },
      { stripeAccount: ps.stripe_connect_account_id },
    );

    return new Response(JSON.stringify({ url: checkoutSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    // deno-lint-ignore no-explicit-any
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
