import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    const normalized = (email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      return new Response(JSON.stringify({ error: "Enter a valid email address." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Idempotent — re-requesting just resends the link, doesn't touch usage stats.
    await supabase
      .from("demo_requests")
      .upsert({ for_value: normalized, kind: "email" }, { onConflict: "for_value", ignoreDuplicates: true });

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const demoUrl = `${appUrl}/demo?for=${encodeURIComponent(normalized)}`;

    const html = emailTemplate({
      label: "Demo access",
      title: "Here's your Clarity demo link",
      body: para(
        "Thanks for your interest in Clarity! Click below to try it out as a therapist or a client — no account needed.",
      ),
      cta: { label: "Open the demo", url: demoUrl },
      footerNote: "You're receiving this because you requested a Clarity demo.",
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    await sendEmail({ to: normalized, subject: "Your Clarity demo link", html, resendKey, fromEmail });

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
