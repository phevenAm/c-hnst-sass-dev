import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Manager invites another admin into their agency. Creates a single-use
// agency_invite_token and emails a sign-up link. The invited person follows
// /register?agency_invite=<token>; consume_agency_invite() attaches them.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Caller must be an ACTIVE MANAGER of an agency.
    const { data: membership } = await supabase
      .from("agency_members")
      .select("agency_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || membership.role !== "manager" || membership.status !== "active") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role === "manager" ? "manager" : "counsellor";
    const employmentType = body?.employment_type === "freelance" ? "freelance" : "employee";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), { status: 400, headers: corsHeaders });
    }

    const { data: agency } = await supabase.from("agencies").select("name").eq("id", membership.agency_id).single();

    // Drop any prior unused invite for the same email in this agency.
    await supabase
      .from("agency_invite_token")
      .delete()
      .eq("agency_id", membership.agency_id)
      .eq("email", email)
      .is("used_at", null);

    const { data: invite, error: inviteErr } = await supabase
      .from("agency_invite_token")
      .insert({
        agency_id: membership.agency_id,
        email,
        role,
        employment_type: employmentType,
        created_by: user.id,
      })
      .select("token")
      .single();
    if (inviteErr) throw new Error(inviteErr.message);

    const signupUrl = `${appUrl}/register?agency_invite=${encodeURIComponent(invite.token)}&email=${encodeURIComponent(email)}`;
    const agencyName = agency?.name ?? "an agency";
    const roleLabel = role === "manager" ? "a manager" : "a counsellor";

    const html = emailTemplate({
      label: "Agency invitation",
      title: `Join ${agencyName} on Clarity`,
      body: [
        para(
          `You've been invited to join <strong>${agencyName}</strong> as ${roleLabel} on Clarity, the practice management platform for counsellors and therapists.`,
        ),
        ...(message ? [noteBox(message)] : []),
        para(
          "Use the button below to set up your account. Your invitation is already applied — just follow the prompts.",
        ),
        noteBox(
          `If the button doesn't work, open <a href="${signupUrl}" style="color:#2d7264;">${appUrl}/register</a> and it will pick up your invitation automatically.`,
        ),
      ].join(""),
      cta: { label: "Accept invitation", url: signupUrl },
      footerNote: `This invitation was sent by a manager at ${agencyName}. If you weren't expecting it, you can ignore this email.`,
    });

    const subject = `You've been invited to join ${agencyName} on Clarity`;
    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: email, subject, html, resendKey, fromEmail });
    } catch (sendErr: any) {
      await logEmail(supabase, {
        adminId: user.id,
        emailType: "agency_member_invite",
        recipientEmail: email,
        subject,
        status: "failed",
        errorMessage: sendErr.message,
      });
      throw sendErr;
    }

    await logEmail(supabase, {
      adminId: user.id,
      emailType: "agency_member_invite",
      recipientEmail: email,
      subject,
      resendEmailId: resendId,
      status: "sent",
    });

    return new Response(JSON.stringify({ ok: true, token: invite.token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("invite-agency-member ERROR:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
