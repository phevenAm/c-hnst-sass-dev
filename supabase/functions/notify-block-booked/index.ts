import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

// One confirmation email for a whole block booking, instead of the caller
// firing notify-session-booked once per session in the block. Takes every
// session id in the block; sends a single email listing all the dates and
// the block total, logs one email row against the earliest session, and
// writes one notification.
const EMAIL_TYPE = "session_booked";

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

    const { session_ids } = await req.json();
    if (!Array.isArray(session_ids) || session_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Missing session_ids" }), { status: 400, headers: corsHeaders });
    }

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, client_id, scheduled_at, duration_minutes, location, address, price_pence, paid")
      .in("id", session_ids)
      .order("scheduled_at", { ascending: true });

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ error: "Sessions not found" }), { status: 404, headers: corsHeaders });
    }

    // Every session in a block belongs to the same client; guard against a
    // caller passing a mixed set.
    const clientId = sessions[0].client_id;
    if (!clientId || sessions.some((s) => s.client_id !== clientId)) {
      return new Response(JSON.stringify({ error: "Sessions span multiple clients" }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    const anchorSessionId = sessions[0].id;

    const [{ data: clientProfile }, { data: authResult }] = await Promise.all([
      supabase
        .from("users")
        .select("first_name, admin_id, email_prefs_disabled, unsubscribe_token")
        .eq("id", clientId)
        .single(),
      supabase.auth.admin.getUserById(clientId),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const subject = `Your ${sessions.length}-session block is confirmed`;
    let counsellorName: string | undefined;

    const skip = async () => {
      await logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId,
        sessionId: anchorSessionId,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "skipped",
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
    const isOnline = sessions[0].location !== "in_person";
    const blockTotalPence = sessions.reduce((sum, s) => sum + (s.price_pence ?? 0), 0);
    const blockTotal = blockTotalPence ? `£${(blockTotalPence / 100).toFixed(2)}` : null;
    const allPaid = sessions.every((s) => s.paid);

    // Short "1 Dec"-style dates for the notification range (the email itself
    // uses the fuller formatDate).
    const shortDate = (iso: string) =>
      new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
    const firstShort = shortDate(sessions[0].scheduled_at);
    const lastShort = shortDate(sessions[sessions.length - 1].scheduled_at);
    const rangeLabel = firstShort === lastShort ? firstShort : `${firstShort} – ${lastShort}`;

    const unsubscribeUrl = clientProfile?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

    const dateRows = sessions.map((s, i) => ({
      label: i === 0 ? "Sessions" : "",
      value: formatDate(s.scheduled_at),
      bold: i === 0,
    }));

    const tableRows = [
      ...dateRows,
      { label: "Duration", value: `${sessions[0].duration_minutes} minutes each` },
      { label: "Location", value: isOnline ? "Online" : "In person" },
      ...(isOnline && sessions[0].address ? [{ label: "Meeting link", value: sessions[0].address }] : []),
      ...(blockTotal ? [{ label: "Block fee", value: `${blockTotal} (covers all ${sessions.length} sessions)` }] : []),
    ];

    const html = emailTemplate({
      label: "Block Confirmed",
      title: `Hi ${firstName}, your ${sessions.length}-session block is booked`,
      body:
        para("Your block of sessions has been confirmed. Here are the details:") +
        detailsTable(tableRows) +
        noteBox(
          "These sessions are booked and paid for as one block. If you need to cancel or reschedule any of them, please do so at least 48 hours in advance through your client portal.",
        ),
      cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
      footerNote: "You received this email because a block of sessions was booked for you through Clarity.",
      unsubscribeUrl,
      counsellorName,
    });

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId,
        sessionId: anchorSessionId,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "failed",
        errorMessage: sendErr.message,
      });
      throw sendErr;
    }

    // Client notification: what was booked + a nudge to pay if it's unpaid.
    // The email_logs row is stamped against a block session, so the generic
    // email_log_admin_notify trigger deliberately skips it (see migration
    // 20260829000001) — the admin notification below is the richer stand-in.
    const clientMessage = allPaid
      ? `Your ${sessions.length}-session block is booked — ${rangeLabel}.`
      : `Your ${sessions.length}-session block is booked — ${rangeLabel}${
          blockTotal ? ` (${blockTotal})` : ""
        }. Tap to pay for the block.`;

    const adminMessage = `${firstName}'s ${sessions.length}-session block (${rangeLabel})${
      blockTotal ? ` — ${blockTotal}` : ""
    } is booked. Confirmation email sent${allPaid ? "" : "; payment outstanding"}.`;

    await Promise.all([
      logEmail(supabase, {
        adminId: clientProfile?.admin_id,
        clientId,
        sessionId: anchorSessionId,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        resendEmailId: resendId,
        status: "sent",
      }),
      supabase.from("notifications").insert({
        user_id: clientId,
        type: "session_booked",
        message: clientMessage,
        url: "/my-sessions",
      }),
      clientProfile?.admin_id
        ? supabase.from("notifications").insert({
            user_id: clientProfile.admin_id,
            type: "session_booked",
            message: adminMessage,
            url: `/admin/clients/${clientId}?session=${anchorSessionId}`,
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
