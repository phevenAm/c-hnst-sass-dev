import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import { detailsTable, emailTemplate, formatDate, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const { refund_request_id, approved, notify } = await req.json();
    if (!refund_request_id || typeof approved !== "boolean") {
      return new Response(JSON.stringify({ error: "Missing refund_request_id or approved" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // admin_id = auth.uid() scopes this to the caller's own queue — an admin
    // can't approve/decline another practice's refund request.
    const { data: rr } = await supabase
      .from("refund_requests")
      .select("*, sessions(scheduled_at)")
      .eq("id", refund_request_id)
      .eq("admin_id", user.id)
      .single();

    if (!rr) {
      return new Response(JSON.stringify({ error: "Refund request not found" }), { status: 404, headers: corsHeaders });
    }
    if (rr.status !== "pending") {
      return new Response(JSON.stringify({ error: "This refund request was already resolved" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    if (approved) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
      await stripe.refunds.create({
        payment_intent: rr.stripe_payment_intent_id,
        amount: rr.amount_pence,
      });
      // Money's gone back — the session shouldn't still read as paid in stats/ledger.
      await supabase.from("sessions").update({ paid: false }).eq("id", rr.session_id);
    }

    await supabase
      .from("refund_requests")
      .update({
        status: approved ? "approved" : "declined",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq("id", refund_request_id);

    if (notify && rr.client_id) {
      const [{ data: clientProfile }, { data: authResult }, { data: practiceSettings }] = await Promise.all([
        supabase.from("users").select("first_name").eq("id", rr.client_id).single(),
        supabase.auth.admin.getUserById(rr.client_id),
        supabase.from("practice_settings").select("counsellor_name").eq("admin_id", user.id).maybeSingle(),
      ]);

      const clientEmail = authResult?.user?.email;
      if (clientEmail) {
        const firstName = clientProfile?.first_name ?? "there";
        const dateStr = formatDate(rr.sessions?.scheduled_at ?? rr.created_at);
        const pricePounds = (rr.amount_pence / 100).toFixed(2);
        const subject = approved
          ? `Your refund of £${pricePounds} is on its way`
          : `Update on your refund request — session on ${dateStr}`;

        const html = emailTemplate({
          label: "Refund Update",
          title: `Hi ${firstName},`,
          body: approved
            ? para(
                `Your refund of <strong style="color:#2d2926;">£${pricePounds}</strong> for the cancelled session on ${dateStr} has been approved and is being processed by Stripe. It can take a few business days to appear.`,
              )
            : para(
                `Your refund request for the cancelled session on ${dateStr} wasn't approved. If you have questions, please contact your therapist directly.`,
              ) + detailsTable([{ label: "Amount", value: `£${pricePounds}` }]),
          footerNote: "You received this email about a refund request through Clarity.",
          counsellorName: practiceSettings?.counsellor_name ?? undefined,
        });

        const resendKey = Deno.env.get("RESEND_API_KEY")!;
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
        await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
      }

      await supabase.from("notifications").insert({
        user_id: rr.client_id,
        type: approved ? "refund_approved" : "refund_declined",
        message: approved
          ? `Your refund of £${(rr.amount_pence / 100).toFixed(2)} has been approved.`
          : `Your refund request wasn't approved — contact your therapist if you have questions.`,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
