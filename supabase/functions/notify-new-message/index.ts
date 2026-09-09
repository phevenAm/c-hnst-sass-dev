import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

// Runs on every direct message. Two jobs, by direction:
//   client → practitioner : post an away / out-of-hours auto-reply if the
//                            practitioner has one configured and is away.
//   practitioner → client : email the client, but only if they've been away
//                            and not already emailed for this thread recently.
// No message body ever leaves the app (not in emails, not in logs).
const EMAIL_TYPE = "new_message";
const AWAY_MINUTES = 10; // client counts as "here" if seen within this
const COOLDOWN_MINUTES = 15; // min gap between emails for one thread
const AUTOREPLY_COOLDOWN_MINUTES = 240; // one "I'm away" per thread per 4h
const DEFAULT_TZ = "Europe/London";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const minutesAgo = (iso: string | null | undefined): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Number.POSITIVE_INFINITY;

type OfficeHours = { days?: number[]; from?: string; to?: string; tz?: string };

// { weekday: 1..7 (Mon..Sun), hhmm: "HH:MM", ymd: "YYYY-MM-DD" } in a timezone.
function nowInTz(tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    weekday: wd[get("weekday")] ?? 1,
    hhmm: `${get("hour")}:${get("minute")}`,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function practitionerIsAway(awayUntil: string | null, hours: OfficeHours | null): boolean {
  const tz = hours?.tz || DEFAULT_TZ;
  const { weekday, hhmm, ymd } = nowInTz(tz);
  if (awayUntil && ymd <= awayUntil) return true; // holiday window (inclusive)
  if (hours?.from && hours?.to) {
    const days = hours.days?.length ? hours.days : [1, 2, 3, 4, 5];
    return !days.includes(weekday) || hhmm < hours.from || hhmm >= hours.to;
  }
  // Enabled with neither a holiday date nor office hours = always away.
  return !awayUntil;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: "Missing message_id" }), { status: 400, headers: corsHeaders });
    }

    const { data: message } = await supabase
      .from("messages")
      .select("conversation_id, sender_id, recipient_id, is_auto")
      .eq("id", message_id)
      .single();
    if (!message) {
      return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers: corsHeaders });
    }

    const { data: convo } = await supabase
      .from("conversations")
      .select("id, client_id, admin_id, last_notified_at, autoreply_at")
      .eq("id", message.conversation_id)
      .single();
    if (!convo) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404, headers: corsHeaders });
    }

    // ── client → practitioner : away / out-of-hours auto-reply ──────────────
    if (message.recipient_id === convo.admin_id && !message.is_auto) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("msg_autoreply_enabled, msg_autoreply_text, msg_away_until, msg_office_hours")
        .eq("admin_id", convo.admin_id)
        .maybeSingle();

      const text = (ps?.msg_autoreply_text ?? "").trim();
      if (!ps?.msg_autoreply_enabled || !text) {
        return new Response(JSON.stringify({ ok: true, skipped: "no autoreply configured" }), { headers: corsHeaders });
      }
      if (minutesAgo(convo.autoreply_at) < AUTOREPLY_COOLDOWN_MINUTES) {
        return new Response(JSON.stringify({ ok: true, skipped: "autoreply cooldown" }), { headers: corsHeaders });
      }
      if (!practitionerIsAway(ps.msg_away_until ?? null, (ps.msg_office_hours ?? null) as OfficeHours | null)) {
        return new Response(JSON.stringify({ ok: true, skipped: "practitioner available" }), { headers: corsHeaders });
      }

      await supabase.from("messages").insert({
        conversation_id: convo.id,
        sender_id: convo.admin_id,
        recipient_id: convo.client_id,
        body: text,
        is_auto: true,
      });
      await supabase.from("conversations").update({ autoreply_at: new Date().toISOString() }).eq("id", convo.id);
      return new Response(JSON.stringify({ ok: true, autoReplied: true }), { headers: corsHeaders });
    }

    // Anything else that isn't a message TO the client — nothing to do.
    if (message.recipient_id !== convo.client_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "recipient is not the client" }), {
        headers: corsHeaders,
      });
    }

    // Per-thread cooldown.
    if (minutesAgo(convo.last_notified_at) < COOLDOWN_MINUTES) {
      return new Response(JSON.stringify({ ok: true, skipped: "cooldown" }), { headers: corsHeaders });
    }

    const [{ data: client }, { data: authResult }] = await Promise.all([
      supabase
        .from("users")
        .select("first_name, admin_id, email_prefs_disabled, unsubscribe_token, last_seen_at")
        .eq("id", convo.client_id)
        .single(),
      supabase.auth.admin.getUserById(convo.client_id),
    ]);

    // Client is currently active — the in-app badge is enough.
    if (minutesAgo(client?.last_seen_at) < AWAY_MINUTES) {
      return new Response(JSON.stringify({ ok: true, skipped: "client active" }), { headers: corsHeaders });
    }

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ ok: true, skipped: "client has no email" }), { headers: corsHeaders });
    }

    const subject = "You have a new message";

    let counsellorName: string | undefined;
    if (client?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", client.admin_id)
        .maybeSingle();
      counsellorName = ps?.counsellor_name ?? undefined;

      if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
        await logEmail(supabase, {
          adminId: client.admin_id,
          clientId: convo.client_id,
          emailType: EMAIL_TYPE,
          recipientEmail: clientEmail,
          subject,
          status: "skipped",
        });
        return new Response(JSON.stringify({ ok: true, skipped: "practice muted" }), { headers: corsHeaders });
      }
    }

    if ((client?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
      await logEmail(supabase, {
        adminId: client?.admin_id,
        clientId: convo.client_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "skipped",
      });
      return new Response(JSON.stringify({ ok: true, skipped: "client unsubscribed" }), { headers: corsHeaders });
    }

    const firstName = client?.first_name ?? "there";
    const from = counsellorName ? `from ${counsellorName}` : "from your counsellor";
    const unsubscribeUrl = client?.unsubscribe_token
      ? `${appUrl}/unsubscribe?token=${client.unsubscribe_token}&type=${EMAIL_TYPE}`
      : undefined;

    const html = emailTemplate({
      label: "New message",
      title: `Hi ${firstName}, you have a new message`,
      body:
        para(`You've received a new message ${from} through Clarity.`) +
        para("Messages are for practical things like scheduling — open the app to read it and reply."),
      cta: { label: "Open messages", url: `${appUrl}/messages` },
      footerNote: "You received this because someone messaged you through Clarity.",
      unsubscribeUrl,
      counsellorName,
    });

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail, unsubscribeUrl });
    } catch (sendErr) {
      await logEmail(supabase, {
        adminId: client?.admin_id,
        clientId: convo.client_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        status: "failed",
        errorMessage: sendErr instanceof Error ? sendErr.message : String(sendErr),
      });
      throw sendErr;
    }

    await Promise.all([
      supabase.from("conversations").update({ last_notified_at: new Date().toISOString() }).eq("id", convo.id),
      logEmail(supabase, {
        adminId: client?.admin_id,
        clientId: convo.client_id,
        emailType: EMAIL_TYPE,
        recipientEmail: clientEmail,
        subject,
        resendEmailId: resendId,
        status: "sent",
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
