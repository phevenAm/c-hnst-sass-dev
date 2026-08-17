import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "session_rescheduled";

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
      supabase
        .from("users")
        .select("first_name, admin_id, email_prefs_disabled, unsubscribe_token")
        .eq("id", session.client_id)
        .single(),
      supabase.auth.admin.getUserById(session.client_id),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const newDateStr = formatDate(session.scheduled_at);
    const subject = `Your session has been rescheduled — now ${newDateStr}`;
    let counsellorName: string | undefined;

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();

      counsellorName = ps?.counsellor_name ?? undefined;

      if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
        await logEmail(supabase, {
          adminId: clientProfile.admin_id,
          clientId: session.client_id,
          sessionId: session_id,
          emailType: EMAIL_TYPE,
          recipientEmail: clientEmail,
          subject,
          status: "skipped",
        });
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
      }
    }

    if ((clientProfile?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
      await logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId: session.client_id,
        sessionId: session_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "skipped",
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    const firstName = clientProfile?.first_name ?? "there";
    const isOnline = session.location !== "in_person";
    const unsubscribeUrl = clientProfile?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

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
      footerNote: "You received this email because your session was rescheduled through Clarity.",
      unsubscribeUrl,
      counsellorName,
    });

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId: session.client_id,
        sessionId: session_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "failed",
        errorMessage: sendErr.message,
      });
      throw sendErr;
    }

    await Promise.all([
      logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId: session.client_id,
        sessionId: session_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        resendEmailId: resendId,
        status: "sent",
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
