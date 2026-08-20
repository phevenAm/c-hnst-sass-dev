import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, noteBox, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { session_id, message } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), { status: 400, headers: corsHeaders });
    }

    // Sessions use `created_by` as the admin FK (not admin_id).
    const { data: targetSession } = await supabase
      .from("sessions")
      .select("client_id, created_by, scheduled_at, status, paid, metadata")
      .eq("id", session_id)
      .single();

    if (!targetSession) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: corsHeaders });
    }
    if (targetSession.client_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }
    if (targetSession.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Session is already cancelled" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    // Block payments cover the whole block up front — an individual session
    // within a paid block can't be refunded/cancelled on its own. The admin
    // can still cancel it manually if the whole block needs changing.
    // Separately, an admin can turn off block-session cancellation requests
    // entirely regardless of payment state (Settings -> Practice), so check
    // that first since it's the stricter gate.
    const blockId = (targetSession.metadata as { block_id?: string } | null)?.block_id;
    if (blockId) {
      const { data: cancelSettings } = await supabase
        .from("practice_settings")
        .select("allow_block_session_cancellation")
        .eq("admin_id", targetSession.created_by)
        .maybeSingle();

      if (cancelSettings?.allow_block_session_cancellation === false) {
        return new Response(
          JSON.stringify({
            error: "Sessions that are part of a block can't be cancelled individually — contact your therapist.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      if (targetSession.paid) {
        return new Response(
          JSON.stringify({
            error: "This session is part of a paid block and can't be cancelled individually — contact your therapist.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }
    }

    const { data: existing } = await supabase
      .from("cancellation_requests")
      .select("id")
      .eq("session_id", session_id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "A cancellation request is already pending for this session" }), {
        status: 409,
        headers: corsHeaders,
      });
    }

    const { error: insertError } = await supabase.from("cancellation_requests").insert({
      session_id,
      client_id: user.id,
      message: message ?? null,
    });
    if (insertError) throw insertError;

    const [{ data: client }, { data: practiceSettings }] = await Promise.all([
      supabase.from("users").select("first_name, last_name").eq("id", user.id).single(),
      supabase
        .from("practice_settings")
        .select("counsellor_name")
        .eq("admin_id", targetSession.created_by)
        .maybeSingle(),
    ]);

    const clientName = client ? `${client.first_name} ${client.last_name}` : "A client";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const dateStr = formatDate(targetSession.scheduled_at);

    await supabase.from("notifications").insert({
      user_id: targetSession.created_by,
      type: "cancellation_request",
      message: `${clientName} requested to cancel their session on ${dateStr}.`,
      url: `${appUrl}/admin/clients/${user.id}`,
    });

    const { data: adminAuthResult } = await supabase.auth.admin.getUserById(targetSession.created_by);
    const adminEmail = adminAuthResult?.user?.email;

    if (adminEmail) {
      const html = emailTemplate({
        label: "Session Update",
        title: `Cancellation request from ${clientName}`,
        body:
          para(
            "Your client would like to cancel their upcoming session. Review the details below and cancel it from their client page — nothing is cancelled automatically.",
          ) +
          detailsTable([
            { label: "Session date", value: dateStr, bold: true },
            ...(message ? [{ label: "Note", value: message }] : []),
          ]) +
          noteBox("Log in and open the client page to accept or decline this request."),
        cta: { label: "View client page", url: `${appUrl}/admin/clients/${user.id}` },
        footerNote: "This email was sent because a client submitted a cancellation request through Clarity.",
        counsellorName: practiceSettings?.counsellor_name ?? undefined,
      });

      await sendEmail({
        to: adminEmail,
        subject: `Cancellation request — ${clientName}`,
        html,
        resendKey: Deno.env.get("RESEND_API_KEY")!,
        fromEmail: Deno.env.get("RESEND_FROM_EMAIL")!,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
