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

    const { session_id, previous_date } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("client_id, scheduled_at, duration_minutes, location, address")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    const [{ data: clientProfile }, { data: authResult }] = await Promise.all([
      supabase.from("users").select("first_name").eq("id", session.client_id).single(),
      supabase.auth.admin.getUserById(session.client_id),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const firstName = clientProfile?.first_name ?? "there";
    const newDateStr = formatDate(session.scheduled_at);
    const isOnline = session.location !== "in_person";

    const tableRows = [
      ...(previous_date ? [{ label: "Previous date", value: formatDate(previous_date) }] : []),
      { label: "New date & time", value: newDateStr, bold: true },
      { label: "Duration", value: `${session.duration_minutes} minutes` },
      { label: "Location", value: isOnline ? "Online" : "In person" },
      ...(isOnline && session.address ? [{ label: "Meeting link", value: session.address }] : []),
    ];

    const html = emailTemplate({
      label: "Session Rescheduled",
      title: `Hi ${firstName}, your session has been rescheduled`,
      body:
        para("Your session has been moved to a new date and time. Here are the updated details:") +
        detailsTable(tableRows) +
        noteBox("If this date does not work for you, please contact your therapist to arrange an alternative."),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "This email was sent because your session was rescheduled through the WithMe portal.",
    });

    await Promise.all([
      sendEmail({
        to: clientEmail,
        subject: `Your session has been rescheduled — now ${newDateStr}`,
        html,
        resendKey,
        fromEmail,
      }),
      supabase.from("notifications").insert({
        user_id: session.client_id,
        type: "session_rescheduled",
        message: `Your session has been rescheduled to ${newDateStr}.`,
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
