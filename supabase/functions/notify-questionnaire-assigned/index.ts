import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "questionnaire_assigned";

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

    const { user_id, questionnaire_id } = await req.json();
    if (!user_id || !questionnaire_id) {
      return new Response(JSON.stringify({ error: "Missing user_id or questionnaire_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const [{ data: clientProfile }, { data: questionnaire }, { data: authResult }] = await Promise.all([
      supabase
        .from("users")
        .select("first_name, admin_id, email_prefs_disabled, unsubscribe_token")
        .eq("id", user_id)
        .single(),
      supabase.from("questionnaires").select("title").eq("id", questionnaire_id).single(),
      supabase.auth.admin.getUserById(user_id),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    const title = questionnaire?.title ?? "a check-in";
    const subject = `New check-in assigned: ${title}`;
    let counsellorName: string | undefined;

    const logBase = {
      adminId: clientProfile?.admin_id ?? null,
      clientId: user_id,
      emailType: EMAIL_TYPE,
      recipientEmail: clientEmail,
      subject,
    };

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();

      counsellorName = ps?.counsellor_name ?? undefined;

      if ((ps?.disabled_email_types ?? []).includes(EMAIL_TYPE)) {
        await logEmail(supabase, { ...logBase, status: "skipped" });
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
      }
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
      label: "New Check-in",
      title: `Hi ${firstName}, you have a new check-in`,
      body:
        para(`Your therapist has assigned you a new check-in: <strong style="color:#2d2520;">${title}</strong>.`) +
        para("Please take a moment to complete it — your responses help track your progress and guide your sessions."),
      cta: { label: "Complete check-in", url: `${appUrl}/check-in` },
      footerNote: "You received this email because a check-in was assigned to you through Clarity.",
      unsubscribeUrl,
      counsellorName,
    });

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, { ...logBase, status: "failed", errorMessage: sendErr.message });
      throw sendErr;
    }

    // The in-app notification for this event is handled by the
    // qa_notify_client_assigned DB trigger (fires on the
    // questionnaire_assignments insert itself, reliably regardless of
    // caller) — this function's job is only the email.
    await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
