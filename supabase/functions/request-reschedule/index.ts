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

    const { session_id, requested_at, message } = await req.json();
    if (!session_id || !requested_at) {
      return new Response(JSON.stringify({ error: "Missing session_id or requested_at" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Fetch the session being rescheduled to get the owning admin and duration.
    // Sessions use `created_by` as the admin FK (not admin_id).
    const { data: targetSession } = await supabase
      .from("sessions")
      .select("created_by, duration_minutes")
      .eq("id", session_id)
      .single();

    if (targetSession) {
      const duration = (targetSession.duration_minutes ?? 50) * 60_000;
      const reqStart = new Date(requested_at).getTime();
      const reqEnd = reqStart + duration;

      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("scheduled_at, duration_minutes")
        .eq("created_by", targetSession.created_by)
        .neq("id", session_id)
        .neq("status", "cancelled");

      const hasConflict = (existingSessions ?? []).some((s) => {
        const sStart = new Date(s.scheduled_at).getTime();
        const sEnd = sStart + (s.duration_minutes ?? 50) * 60_000;
        return reqStart < sEnd && reqEnd > sStart;
      });

      if (hasConflict) {
        return new Response(
          JSON.stringify({ error: "That time slot is already booked. Please choose a different time." }),
          { status: 409, headers: corsHeaders },
        );
      }
    }

    const { error: insertError } = await supabase.from("reschedule_requests").insert({
      session_id,
      client_id: user.id,
      requested_at,
      message: message ?? null,
    });
    if (insertError) throw insertError;

    const [{ data: client }, { data: session }, { data: admins }] = await Promise.all([
      supabase.from("users").select("first_name, last_name").eq("id", user.id).single(),
      supabase.from("sessions").select("scheduled_at").eq("id", session_id).single(),
      supabase.from("users").select("id").eq("role", "admin"),
    ]);

    const clientName = client ? `${client.first_name} ${client.last_name}` : "A client";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    if (admins && admins.length > 0) {
      await supabase.from("notifications").insert(
        admins.map((a: { id: string }) => ({
          user_id: a.id,
          type: "reschedule_request",
          message: `${clientName} requested to move their session${session?.scheduled_at ? ` from ${formatDate(session.scheduled_at)}` : ""} to ${formatDate(requested_at)}.`,
          url: `${appUrl}/admin/clients/${user.id}`,
        })),
      );
    }

    const tableRows = [
      { label: "Current date", value: session?.scheduled_at ? formatDate(session.scheduled_at) : "—" },
      { label: "Requested date", value: formatDate(requested_at), bold: true },
      ...(message ? [{ label: "Note", value: message }] : []),
    ];

    const html = emailTemplate({
      label: "Session Update",
      title: `Reschedule request from ${clientName}`,
      body:
        para(
          "Your client would like to move their upcoming session to a new date and time. Review the details below and update the session on their client page.",
        ) +
        detailsTable(tableRows) +
        noteBox("Log in and open the client page to reschedule their session. No action is taken automatically."),
      cta: { label: "View client page", url: `${appUrl}/admin/clients/${user.id}` },
      footerNote: "This email was sent because a client submitted a reschedule request through the WithMe portal.",
    });

    await sendEmail({
      to: Deno.env.get("ADMIN_EMAIL")!,
      subject: `Reschedule request — ${clientName}`,
      html,
      resendKey: Deno.env.get("RESEND_API_KEY")!,
      fromEmail: Deno.env.get("RESEND_FROM_EMAIL")!,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
