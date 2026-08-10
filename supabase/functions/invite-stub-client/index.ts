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

    const { stub_id, email, message, token } = await req.json();
    if (!stub_id || !email || !token) {
      return new Response(JSON.stringify({ error: "Missing stub_id, email, or token" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: stub } = await supabase
      .from("client_stubs")
      .select("codename, first_name, last_name")
      .eq("id", stub_id)
      .single();

    if (!stub) {
      return new Response(JSON.stringify({ error: "Stub not found" }), { status: 404, headers: corsHeaders });
    }

    const displayName = stub.first_name
      ? [stub.first_name, stub.last_name].filter(Boolean).join(" ")
      : (stub.codename ?? "there");

    const signupUrl = `${appUrl}/signup?token=${encodeURIComponent(token)}`;

    const bodyParts = [
      para(`Hi ${displayName},`),
      para(
        "You've been invited to join the WithMe platform. Once you sign up, you'll be able to view your session history, access resources, and stay connected with your therapist.",
      ),
      ...(message ? [noteBox(message)] : []),
      para(
        "Use the button below to create your account. Your access token has already been applied — just follow the prompts.",
      ),
    ];

    const html = emailTemplate({
      label: "You're invited",
      title: "Join the WithMe platform",
      body: bodyParts.join(""),
      cta: { label: "Create your account", url: signupUrl },
      footerNote:
        "This invitation was sent by your therapist via WithMe. If you weren't expecting this, you can safely ignore it.",
    });

    await sendEmail({
      to: email,
      subject: "You've been invited to WithMe",
      html,
      resendKey,
      fromEmail,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
