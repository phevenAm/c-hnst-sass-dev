import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, noteBox, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXAMPLE_DATE = "Monday 10 August 2026 at 2:00pm";
const EXAMPLE_NAME = "Alex";

type EmailType = "reminder" | "session_booked" | "session_cancelled" | "session_rescheduled" | "payment_received";

function buildTemplate(
  type: EmailType,
  appUrl: string,
  customBody?: string,
  hoursBefore = 120,
): { subject: string; html: string } {
  const daysBefore = Math.round(hoursBefore / 24);
  const timeLabel = daysBefore >= 1 ? `${daysBefore} day${daysBefore !== 1 ? "s" : ""}` : `${hoursBefore} hours`;

  switch (type) {
    case "reminder": {
      const body = customBody
        ? para(
            customBody
              .replace(/\{\{name\}\}/gi, EXAMPLE_NAME)
              .replace(/\{\{date\}\}/gi, EXAMPLE_DATE)
              .replace(/\{\{location\}\}/gi, "Online")
              .replace(/\{\{duration\}\}/gi, "50 minutes"),
          ) +
          detailsTable([
            { label: "Date & time", value: EXAMPLE_DATE, bold: true },
            { label: "Duration", value: "50 minutes" },
            { label: "Location", value: "Online" },
          ])
        : para(`This is a friendly reminder that you have a confirmed session coming up in ${timeLabel}.`) +
          detailsTable([
            { label: "Date & time", value: EXAMPLE_DATE, bold: true },
            { label: "Duration", value: "50 minutes" },
            { label: "Location", value: "Online" },
          ]) +
          noteBox("If you need to cancel or reschedule, please do so at least 48 hours before your session.");

      return {
        subject: `[TEST] Reminder: your session on ${EXAMPLE_DATE}`,
        html: emailTemplate({
          label: "Session Reminder",
          title: `Hi ${EXAMPLE_NAME},`,
          body,
          footerNote: "This email was sent because you have a session booked through the WithMe portal.",
        }),
      };
    }

    case "session_booked":
      return {
        subject: `[TEST] Your session is confirmed — ${EXAMPLE_DATE}`,
        html: emailTemplate({
          label: "Session Confirmed",
          title: `Hi ${EXAMPLE_NAME}, your session is booked`,
          body:
            para("Your session has been confirmed. Here are the details:") +
            detailsTable([
              { label: "Date & time", value: EXAMPLE_DATE, bold: true },
              { label: "Duration", value: "50 minutes" },
              { label: "Location", value: "Online" },
              { label: "Fee", value: "£60.00" },
            ]) +
            noteBox(
              "If you need to cancel or reschedule, please do so at least 48 hours in advance through your client portal.",
            ),
          cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
          footerNote: "This email was sent because a session was booked for you through the WithMe portal.",
        }),
      };

    case "session_cancelled":
      return {
        subject: `[TEST] Session cancelled — ${EXAMPLE_DATE}`,
        html: emailTemplate({
          label: "Session Cancelled",
          title: `Hi ${EXAMPLE_NAME}, your session has been cancelled`,
          body:
            para("The following session has been cancelled:") +
            detailsTable([
              { label: "Date & time", value: EXAMPLE_DATE, bold: true },
              { label: "Duration", value: "50 minutes" },
              { label: "Location", value: "Online" },
            ]) +
            noteBox("If you believe this is an error or would like to rebook, please contact your therapist directly."),
          footerNote: "This email was sent because a session was cancelled through the WithMe portal.",
        }),
      };

    case "session_rescheduled":
      return {
        subject: `[TEST] Session rescheduled — ${EXAMPLE_DATE}`,
        html: emailTemplate({
          label: "Session Rescheduled",
          title: `Hi ${EXAMPLE_NAME}, your session has been rescheduled`,
          body:
            para("Your session has been moved to a new time:") +
            detailsTable([
              { label: "New date & time", value: EXAMPLE_DATE, bold: true },
              { label: "Duration", value: "50 minutes" },
              { label: "Location", value: "Online" },
            ]) +
            noteBox("If this new time doesn't work for you, please contact your therapist directly."),
          cta: { label: "View my sessions", url: `${appUrl}/my-sessions` },
          footerNote: "This email was sent because your session was rescheduled through the WithMe portal.",
        }),
      };

    case "payment_received":
      return {
        subject: `[TEST] Payment received — ${EXAMPLE_NAME} (£60.00)`,
        html: emailTemplate({
          label: "Payment Received",
          title: `${EXAMPLE_NAME} has paid`,
          body:
            para(
              `A payment of <strong style="color:#2d2926;">£60.00</strong> has been received for a session on ${EXAMPLE_DATE}.`,
            ) +
            detailsTable([
              { label: "Client", value: EXAMPLE_NAME, bold: true },
              { label: "Amount", value: "£60.00" },
              { label: "Session", value: EXAMPLE_DATE },
            ]),
          cta: { label: "View client page", url: `${appUrl}/admin/clients` },
          footerNote: "This email was sent because a client completed a payment through the WithMe portal.",
        }),
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { type, custom_body, hours_before } = await req.json();
    if (!type) return new Response(JSON.stringify({ error: "Missing type" }), { status: 400, headers: corsHeaders });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const { subject, html } = buildTemplate(type as EmailType, appUrl, custom_body, hours_before ?? 120);

    await sendEmail({ to: user.email!, subject, html, resendKey, fromEmail });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
