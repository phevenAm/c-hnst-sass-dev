import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "session_cancelled";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_AUTO_CANCEL_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400 });
    }

    const { data: session } = await supabase
      .from("sessions")
      .select("client_id, scheduled_at, duration_minutes, location")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
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
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422 });
    }

    const dateStr = formatDate(session.scheduled_at);
    const subject = `Your session on ${dateStr} has been cancelled`;
    let counsellorName: string | undefined;

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();

      counsellorName = ps?.counsellor_name ?? undefined;

      if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
        return new Response(JSON.stringify({ ok: true, skipped: true }));
      }
    }

    if ((clientProfile?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
      return new Response(JSON.stringify({ ok: true, skipped: true }));
    }

    const firstName = clientProfile?.first_name ?? "there";
    const unsubscribeUrl = clientProfile?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

    const html = emailTemplate({
      label: "Session Cancelled",
      title: `Hi ${firstName}, your session has been cancelled`,
      body:
        para(
          "Your upcoming session has been automatically cancelled because payment was not received before the deadline.",
        ) +
        detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          { label: "Duration", value: `${session.duration_minutes} minutes` },
          { label: "Location", value: session.location !== "in_person" ? "Online" : "In person" },
        ]) +
        noteBox("If you believe this is an error or would like to rebook, please contact your therapist directly."),
      footerNote: "You received this email because a session was automatically cancelled through Clarity.",
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
        type: "session_cancelled",
        message: `Your session on ${dateStr} was automatically cancelled due to non-payment.`,
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }));
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
