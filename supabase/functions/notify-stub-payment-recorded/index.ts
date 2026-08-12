import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "payment_confirmed";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { stub_session_id } = await req.json();
    if (!stub_session_id) {
      return new Response(JSON.stringify({ error: "Missing stub_session_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: ss } = await supabase
      .from("stub_sessions")
      .select(
        "id, scheduled_at, duration_minutes, location, amount_paid, currency, admin_id, client_stubs(first_name, email)",
      )
      .eq("id", stub_session_id)
      .single();

    if (!ss) {
      return new Response(JSON.stringify({ error: "Stub session not found" }), { status: 404, headers: corsHeaders });
    }

    const stub = ss.client_stubs as { first_name: string; email: string | null } | null;
    if (!stub?.email) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_email" }), { headers: corsHeaders });
    }

    if (!ss.amount_paid) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_amount" }), { headers: corsHeaders });
    }

    const { data: ps } = await supabase
      .from("practice_settings")
      .select("disabled_email_types, counsellor_name")
      .eq("admin_id", ss.admin_id)
      .maybeSingle();

    const dateStr = formatDate(ss.scheduled_at);
    const currencySymbol = ss.currency === "GBP" ? "£" : ss.currency === "EUR" ? "€" : "$";
    const amountFormatted = `${currencySymbol}${Number(ss.amount_paid).toFixed(2)}`;
    const subject = `Payment confirmed — your session on ${dateStr}`;
    const logBase = {
      adminId: ss.admin_id,
      clientId: null,
      sessionId: null,
      emailType: EMAIL_TYPE,
      recipientEmail: stub.email,
      subject,
    };

    if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
      await logEmail(supabase, { ...logBase, status: "skipped" });
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
    }

    const firstName = stub.first_name ?? "there";
    const isOnline = ss.location !== "in_person";
    const counsellorName = ps?.counsellor_name ?? undefined;

    const html = emailTemplate({
      label: "Payment Confirmed",
      title: `Hi ${firstName},`,
      body:
        para(
          `Your payment of <strong style="color:#2d2926;">${amountFormatted}</strong> has been received and your session is confirmed.`,
        ) +
        detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          ...(ss.duration_minutes ? [{ label: "Duration", value: `${ss.duration_minutes} minutes` }] : []),
          { label: "Location", value: isOnline ? "Online" : "In person" },
          { label: "Amount paid", value: amountFormatted },
        ]),
      footerNote: "You received this email because your payment was recorded for a session.",
      counsellorName,
    });

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: stub.email, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, { ...logBase, status: "failed", errorMessage: sendErr.message });
      throw sendErr;
    }

    await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
