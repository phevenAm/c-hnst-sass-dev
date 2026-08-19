import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, para, sendEmail } from "../_shared/email.ts";

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

    // Refunds are never automatic — this only decides whether the cancellation
    // *qualifies* for one (Stripe-paid, cancelled outside the practice's
    // configured cutoff window — Settings → Practice → Reschedule &
    // cancellation cutoff; no cutoff configured means no time restriction, so
    // always eligible). If it qualifies, a pending refund_requests row is
    // created and the admin is notified — they have to explicitly approve
    // before any money moves, via respond-refund-request.
    let refundRequested = false;
    let refundSkippedReason: "not_stripe_payment" | "within_cutoff" | null = null;

    if (session.paid && session.stripe_payment_intent_id) {
      const { data: practiceSettings } = await supabase
        .from("practice_settings")
        .select("reschedule_cutoff_hours, counsellor_name")
        .eq("admin_id", session.created_by)
        .maybeSingle();

      const cutoffHours = practiceSettings?.reschedule_cutoff_hours ?? null;
      const msUntilSession = new Date(session.scheduled_at).getTime() - Date.now();
      const outsideCutoff = cutoffHours === null || msUntilSession > cutoffHours * 60 * 60 * 1000;

      if (outsideCutoff) {
        const { error: insertErr } = await supabase.from("refund_requests").insert({
          session_id,
          admin_id: session.created_by,
          client_id: session.client_id,
          stripe_payment_intent_id: session.stripe_payment_intent_id,
          amount_pence: session.price_pence,
        });

        if (!insertErr) {
          refundRequested = true;

          const { data: adminAuthResult } = await supabase.auth.admin.getUserById(session.created_by);
          const adminEmail = adminAuthResult?.user?.email;
          const dateStr = formatDate(session.scheduled_at);
          const pricePounds = (session.price_pence / 100).toFixed(2);
          const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

          await supabase.from("notifications").insert({
            user_id: session.created_by,
            type: "refund_requested",
            message: `A refund of £${pricePounds} is pending your approval for the cancelled session on ${dateStr}.`,
            url: `${appUrl}/admin/payments`,
          });

          if (adminEmail) {
            const html = emailTemplate({
              label: "Refund Pending",
              title: "A cancellation qualifies for a refund",
              body:
                para(
                  "This session was cancelled outside your cancellation window, so it qualifies for a refund. Nothing has been charged back yet — review and approve it from your payments page.",
                ) +
                detailsTable([
                  { label: "Session date", value: dateStr, bold: true },
                  { label: "Amount", value: `£${pricePounds}` },
                ]),
              cta: { label: "Review refund", url: `${appUrl}/admin/payments` },
              footerNote: "You received this because a Stripe-paid session was cancelled through Clarity.",
              counsellorName: practiceSettings?.counsellor_name ?? undefined,
            });
            const resendKey = Deno.env.get("RESEND_API_KEY")!;
            const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
            await sendEmail({
              to: adminEmail,
              subject: `Refund pending approval — £${pricePounds}`,
              html,
              resendKey,
              fromEmail,
            });
          }
        }
      } else {
        refundSkippedReason = "within_cutoff";
      }
    } else if (session.paid) {
      // Paid but not via Stripe (bank transfer/manual) — no automated refund path.
      refundSkippedReason = "not_stripe_payment";
    }

    await supabase.from("sessions").update({ status: "cancelled" }).eq("id", session_id);

    return new Response(
      JSON.stringify({
        ok: true,
        refund_requested: refundRequested,
        refund_amount_pence: refundRequested ? session.price_pence : null,
        refund_skipped_reason: refundSkippedReason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
