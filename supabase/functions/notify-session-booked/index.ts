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
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("client_id, scheduled_at, duration_minutes, location, address, price_pence")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    const [{ data: clientProfile }, { data: authResult }] = await Promise.all([
      supabase.from("users").select("first_name, admin_id").eq("id", session.client_id).single(),
      supabase.auth.admin.getUserById(session.client_id),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();
      if ((ps?.disabled_email_types ?? []).includes("session_booked")) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
      }
    }

    const firstName = clientProfile?.first_name ?? "there";
    const dateStr = formatDate(session.scheduled_at);
    const isOnline = session.location !== "in_person";
    const pricePounds = session.price_pence ? `£${(session.price_pence / 100).toFixed(2)}` : null;

    const tableRows = [
      { label: "Date & time", value: dateStr, bold: true },
      { label: "Duration", value: `${session.duration_minutes} minutes` },
      { label: "Location", value: isOnline ? "Online" : "In person" },
      ...(isOnline && session.address ? [{ label: "Meeting link", value: session.address }] : []),
      ...(pricePounds ? [{ label: "Fee", value: pricePounds }] : []),
    ];

    const html = emailTemplate({
      label: "Session Confirmed",
      title: `Hi ${firstName}, your session is booked`,
      body:
        para("Your session has been confirmed. Here are the details:") +
        detailsTable(tableRows) +
        noteBox(
          "If you need to cancel or reschedule, please do so at least 48 hours in advance through your client portal.",
        ),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "This email was sent because a session was booked for you through the WithMe portal.",
    });

    await Promise.all([
      sendEmail({
        to: clientEmail,
        subject: `Your session is confirmed — ${dateStr}`,
        html,
        resendKey,
        fromEmail,
      }),
      supabase.from("notifications").insert({
        user_id: session.client_id,
        type: "session_booked",
        message: `Your session on ${dateStr} has been confirmed.`,
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
