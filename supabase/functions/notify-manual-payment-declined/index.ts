import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "payment_declined";

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
      .select("client_id, scheduled_at, duration_minutes, price_pence")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    const [{ data: clientProfile }, { data: authResult }, { data: practiceSettings }] = await Promise.all([
      supabase
        .from("users")
        .select("first_name, email_prefs_disabled, unsubscribe_token")
        .eq("id", session.client_id)
        .single(),
      supabase.auth.admin.getUserById(session.client_id),
      supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", user.id)
        .maybeSingle(),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const dateStr = formatDate(session.scheduled_at);
    const pricePounds = (session.price_pence / 100).toFixed(2);
    const subject = `We couldn't verify your payment — session on ${dateStr}`;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const counsellorName = practiceSettings?.counsellor_name ?? undefined;

    const logBase = {
      adminId: user.id,
      clientId: session.client_id,
      sessionId: session_id,
      emailType: EMAIL_TYPE,
      recipientEmail: clientEmail,
      subject,
    };

    if ((practiceSettings?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
      await logEmail(supabase, { ...logBase, status: "skipped" });
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }
    if ((clientProfile?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
      await logEmail(supabase, { ...logBase, status: "skipped" });
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    const firstName = clientProfile?.first_name ?? "there";
    const unsubscribeUrl = clientProfile?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

    const html = emailTemplate({
      label: "Payment Not Confirmed",
      title: `Hi ${firstName}, we couldn't verify your payment`,
      body:
        para("We weren't able to match a bank transfer to the payment you marked for this session:") +
        detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          { label: "Duration", value: `${session.duration_minutes} minutes` },
          { label: "Amount expected", value: `£${pricePounds}` },
        ]) +
        noteBox("Please double-check the transfer details and try again, or contact your therapist directly."),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "You received this email because a payment claim couldn't be confirmed through Clarity.",
      unsubscribeUrl,
      counsellorName,
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, { ...logBase, status: "failed", errorMessage: sendErr.message });
      throw sendErr;
    }

    await Promise.all([
      logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" }),
      supabase.from("notifications").insert({
        user_id: session.client_id,
        type: "payment_declined",
        message: `We couldn't verify your payment for the session on ${dateStr} — please check the details and try again.`,
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
