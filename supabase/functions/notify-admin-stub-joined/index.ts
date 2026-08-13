import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "stub_joined";

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

    const { stub_id, new_user_id } = await req.json();
    if (!stub_id || !new_user_id) {
      return new Response(JSON.stringify({ error: "Missing stub_id or new_user_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch stub + admin details
    const { data: stub } = await supabase
      .from("client_stubs")
      .select("first_name, last_name, created_by")
      .eq("id", stub_id)
      .single();

    if (!stub) {
      return new Response(JSON.stringify({ error: "Stub not found" }), { status: 404, headers: corsHeaders });
    }

    const adminId = stub.created_by;

    // Get admin email from Supabase Auth
    const { data: adminAuthData } = await supabase.auth.admin.getUserById(adminId);
    const adminEmail = adminAuthData?.user?.email;
    if (!adminEmail) {
      return new Response(JSON.stringify({ error: "Admin email not found" }), { status: 404, headers: corsHeaders });
    }

    // Get admin's display name from practice_settings
    const { data: practiceSettings } = await supabase
      .from("practice_settings")
      .select("counsellor_name, disabled_email_types")
      .eq("admin_id", adminId)
      .single();

    if (practiceSettings?.disabled_email_types?.includes(EMAIL_TYPE)) {
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
    }

    // Get the new user's profile
    const { data: newUser } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", new_user_id)
      .single();

    const clientName = newUser
      ? `${newUser.first_name} ${newUser.last_name}`.trim()
      : `${stub.first_name} ${stub.last_name}`.trim();

    const stubName = `${stub.first_name} ${stub.last_name}`.trim();
    const clientsUrl = `${appUrl}/admin/clients`;

    const subject = `${clientName} has joined the platform`;

    const html = emailTemplate({
      label: "Client Joined",
      title: "A client has joined your practice",
      body:
        para(
          `<strong>${clientName}</strong> — who you previously had on file as offline client <em>${stubName}</em> — has just created an account on the platform.`,
        ) +
        para(
          "Their offline session history, notes, and assigned surveys have all been transferred to their new account. You can view their profile in your clients list.",
        ),
      cta: { label: "View clients", url: clientsUrl },
      footerNote: "You received this email because a client joined your practice.",
      counsellorName: practiceSettings?.counsellor_name ?? undefined,
    });

    const resendId = await sendEmail({ to: adminEmail, subject, html, resendKey, fromEmail });

    await logEmail(supabase, {
      adminId,
      clientId: new_user_id,
      sessionId: null,
      emailType: EMAIL_TYPE,
      recipientEmail: adminEmail,
      subject,
      resendEmailId: resendId,
      status: "sent",
    });

    return new Response(JSON.stringify({ sent: true }), { headers: corsHeaders });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
