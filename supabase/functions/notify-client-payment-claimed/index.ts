import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, para, sendEmail } from "../_shared/email.ts";

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
      .select("client_id, created_by, scheduled_at, duration_minutes, price_pence")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }

    const adminId = session.created_by;
    if (!adminId) {
      return new Response(JSON.stringify({ error: "Session has no admin" }), { status: 422, headers: corsHeaders });
    }

    // Get client name
    const { data: clientProfile } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", session.client_id)
      .single();

    const clientName = clientProfile
      ? `${clientProfile.first_name ?? ""} ${clientProfile.last_name ?? ""}`.trim()
      : "A client";

    // Get admin email
    const { data: adminAuthResult } = await supabase.auth.admin.getUserById(adminId);
    const adminEmail = adminAuthResult?.user?.email;
    if (!adminEmail) {
      return new Response(JSON.stringify({ error: "Admin has no email" }), { status: 422, headers: corsHeaders });
    }

    // Get counsellor name from practice settings
    const { data: ps } = await supabase
      .from("practice_settings")
      .select("counsellor_name")
      .eq("admin_id", adminId)
      .maybeSingle();

    const counsellorName = ps?.counsellor_name ?? undefined;

    const dateStr = formatDate(session.scheduled_at);
    const pricePounds = session.price_pence ? `£${(session.price_pence / 100).toFixed(2)}` : null;

    const tableRows = [
      { label: "Client", value: clientName, bold: true },
      { label: "Session date", value: dateStr },
      ...(pricePounds ? [{ label: "Amount", value: pricePounds }] : []),
    ];

    const subject = `${clientName} has marked their session as paid`;

    const html = emailTemplate({
      label: "Payment Claimed",
      title: `${clientName} says they've paid`,
      body:
        para(
          `${clientName} has let you know they've sent payment for their upcoming session. Please check your bank account to confirm receipt, then mark the session as paid in your portal.`,
        ) + detailsTable(tableRows),
      cta: { label: "View sessions", url: `${appUrl}/admin/clients` },
      footerNote: "You received this because a client marked a session as paid through Clarity.",
      counsellorName,
    });

    await sendEmail({ to: adminEmail, subject, html, resendKey, fromEmail });

    // The in-app notification is handled by the sessions_notify_admin_manual_payment
    // DB trigger (fires off the same manual_payment_status change this claim
    // causes), which deep-links to /admin/payments where the approve/decline
    // action actually lives — this function only needs to send the email.

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
