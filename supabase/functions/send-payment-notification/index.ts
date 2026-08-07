import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, noteBox, para, sendEmail } from "../_shared/email.ts";

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

    const { data: callerProfile } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("client_id, scheduled_at, duration_minutes, location, price_pence")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    const { data: practiceSettings } = await supabase
      .from("practice_settings")
      .select("disabled_email_types")
      .eq("admin_id", user.id)
      .maybeSingle();
    if ((practiceSettings?.disabled_email_types ?? []).includes("payment_received")) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    const [{ data: clientProfile }, { data: authResult }] = await Promise.all([
      supabase.from("users").select("first_name").eq("id", session.client_id).single(),
      supabase.auth.admin.getUserById(session.client_id),
    ]);

    const clientEmail = authResult?.user?.email;
    const firstName = clientProfile?.first_name ?? "there";
    const dateStr = formatDate(session.scheduled_at);
    const pricePounds = (session.price_pence / 100).toFixed(2);
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const html = emailTemplate({
      label: "Payment Confirmed",
      title: `Hi ${firstName},`,
      body:
        para(
          `Your payment of <strong style="color:#2d2926;">£${pricePounds}</strong> has been received and your session is confirmed.`,
        ) +
        detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          { label: "Duration", value: `${session.duration_minutes} minutes` },
          { label: "Location", value: session.location !== "in_person" ? "Online" : "In person" },
          { label: "Amount paid", value: `£${pricePounds}` },
        ]),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "This email was sent because your payment was confirmed through the WithMe portal.",
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;

    await Promise.all([
      supabase.from("notifications").insert({
        user_id: session.client_id,
        type: "marked_paid",
        message: `Your session on ${dateStr} has been marked as paid.`,
      }),

      clientEmail
        ? sendEmail({
            to: clientEmail,
            subject: `Payment confirmed — your session on ${dateStr}`,
            html,
            resendKey,
            fromEmail,
          })
        : Promise.resolve(),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
