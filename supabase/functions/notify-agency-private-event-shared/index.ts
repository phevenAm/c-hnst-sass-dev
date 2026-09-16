import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

// Fired from SQL (notify_agency_of_shared_private_event(), on
// admin_private_events) via net.http_post + an internal secret, once per
// active manager, when a staff member ticks "let my agency manager see this"
// on a private calendar block (holiday, admin time, unavailability). Mirrors
// the in-app notifications row the same trigger already inserted directly —
// this is the email half of that same event.

const EMAIL_TYPE = "agency_private_event_shared";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_AGENCY_PRIVATE_EVENT_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { manager_id, creator_name, event_title, starts_at, ends_at } = (await req.json()) as {
      manager_id?: string;
      creator_name?: string;
      event_title?: string;
      starts_at?: string;
      ends_at?: string;
    };

    if (!manager_id || !creator_name || !event_title || !starts_at || !ends_at) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    const { data: managerAuthData } = await supabase.auth.admin.getUserById(manager_id);
    const managerEmail = managerAuthData?.user?.email;
    if (!managerEmail) {
      return new Response(JSON.stringify({ error: "Manager email not found" }), { status: 404, headers: corsHeaders });
    }

    const { data: practiceSettings } = await supabase
      .from("practice_settings")
      .select("counsellor_name, disabled_email_types")
      .eq("admin_id", manager_id)
      .single();

    if (practiceSettings?.disabled_email_types?.includes(EMAIL_TYPE)) {
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
    }

    const fmt = (iso: string) =>
      new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });

    const subject = `${creator_name} shared a calendar block with you`;
    const html = emailTemplate({
      label: "Agency",
      title: "A staff member shared a calendar block with you",
      body:
        para(`<strong>${creator_name}</strong> marked a private calendar block as visible to you:`) +
        para(`<strong>${event_title}</strong><br/>${fmt(starts_at)} – ${fmt(ends_at)}`),
      cta: { label: "Open agency dashboard", url: `${appUrl}/agency` },
      footerNote: "You received this email because a member of your agency chose to share this with you.",
      counsellorName: practiceSettings?.counsellor_name ?? undefined,
    });

    const resendId = await sendEmail({ to: managerEmail, subject, html, resendKey, fromEmail });

    await logEmail(supabase, {
      adminId: manager_id,
      clientId: null,
      sessionId: null,
      emailType: EMAIL_TYPE,
      recipientEmail: managerEmail,
      subject,
      resendEmailId: resendId,
      status: "sent",
    });

    return new Response(JSON.stringify({ sent: true }), { headers: corsHeaders });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
