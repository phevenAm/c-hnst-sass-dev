import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, noteBox, para, sendEmail } from "../_shared/email.ts";

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
      supabase.from("users").select("first_name, admin_id").eq("id", user_id).single(),
      supabase.from("questionnaires").select("title").eq("id", questionnaire_id).single(),
      supabase.auth.admin.getUserById(user_id),
    ]);

    const clientEmail = authResult?.user?.email;
    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Client has no email" }), { status: 422, headers: corsHeaders });
    }

    if (clientProfile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types")
        .eq("admin_id", clientProfile.admin_id)
        .maybeSingle();
      if ((ps?.disabled_email_types ?? []).includes("questionnaire_assigned")) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders });
      }
    }

    const firstName = clientProfile?.first_name ?? "there";
    const title = questionnaire?.title ?? "a check-in";

    const html = emailTemplate({
      label: "New Check-in",
      title: `Hi ${firstName}, you have a new check-in`,
      body:
        para(`Your therapist has assigned you a new check-in: <strong style="color:#2d2926;">${title}</strong>.`) +
        para("Please take a moment to complete it — your responses help track your progress and guide your sessions.") +
        noteBox("Check-ins only take a few minutes and are completely confidential."),
      cta: { label: "Complete check-in", url: `${appUrl}/check-in` },
      footerNote: "This email was sent because a check-in was assigned to you through the WithMe portal.",
    });

    await Promise.all([
      sendEmail({
        to: clientEmail,
        subject: `New check-in assigned: ${title}`,
        html,
        resendKey,
        fromEmail,
      }),
      supabase.from("notifications").insert({
        user_id,
        type: "questionnaire_assigned",
        message: `A new check-in has been assigned to you: ${title}.`,
      }),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
