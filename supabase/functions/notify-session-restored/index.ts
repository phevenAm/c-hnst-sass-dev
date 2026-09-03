import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

// Sent when an admin restores a previously cancelled session (status flips
// cancelled -> scheduled). Mirrors notify-session-cancelled: one client email
// + one in-app notification, honouring the practice- and client-level
// email opt-outs. The 'restored' session_events row is written by the DB
// trigger log_session_update_event(), not here.
const EMAIL_TYPE = "session_restored";

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
      .select("client_id, scheduled_at, duration_minutes, location, status")
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

    const dateStr = formatDate(session.scheduled_at);
    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const subject = `Your session on ${dateStr} is back on`;
    let counsellorName: string | undefined;

    const skip = async () => {
      await logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId: session.client_id,
        sessionId: session_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "skipped",
      });
      // The in-app notification still goes out even when the email is opted out.
      await supabase.from("notifications").insert({
        user_id: session.client_id,
        type: "session_restored",
        message: `Your session on ${dateStr} has been restored.`,
        url: "/my-sessions",
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    };

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();

      counsellorName = ps?.counsellor_name ?? undefined;
      if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) return await skip();
    }

    if ((clientProfile?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) return await skip();

    const firstName = clientProfile?.first_name ?? "there";
    const unsubscribeUrl = clientProfile?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

    const html = emailTemplate({
      label: "Session Restored",
      title: `Hi ${firstName}, your session is back on`,
      body:
        para("A session that had been cancelled has been restored:") +
        detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          { label: "Duration", value: `${session.duration_minutes} minutes` },
          { label: "Location", value: session.location !== "in_person" ? "Online" : "In person" },
        ]) +
        noteBox("If this doesn't look right, please contact your therapist directly."),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "You received this email because a cancelled session was restored through Clarity.",
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
        type: "session_restored",
        message: `Your session on ${dateStr} has been restored.`,
        url: "/my-sessions",
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
