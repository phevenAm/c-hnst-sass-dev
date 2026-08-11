import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const EMAIL_TYPE = "session_reminder";
const DEFAULT_HOURS_BEFORE = 120; // 5 days
const WINDOW_HALF_HOURS = 12; // daily cron: ±12h tolerance

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendKey || !fromEmail) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL" }), { status: 500 });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const now = Date.now();

  // Broad window covering any possible reminder timing (12h–8 days from now)
  const broadFrom = new Date(now + WINDOW_HALF_HOURS * 3600 * 1000).toISOString();
  const broadTo = new Date(now + 8 * 24 * 3600 * 1000).toISOString();

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, paid, location, client_id")
    .gte("scheduled_at", broadFrom)
    .lte("scheduled_at", broadTo)
    .neq("status", "cancelled");

  if (sessionsError) {
    return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500 });
  }
  if (!sessions || sessions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No sessions in window" }), { status: 200 });
  }

  const clientIds = [...new Set(sessions.map((s: any) => s.client_id as string))];

  // Client profiles including email preferences
  const { data: profiles } = await supabase
    .from("users")
    .select("id, first_name, admin_id, email_prefs_disabled, unsubscribe_token")
    .in("id", clientIds);

  const profileMap: Record<
    string,
    { firstName: string; adminId: string; emailPrefsDisabled: string[]; unsubscribeToken: string | null }
  > = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = {
      firstName: p.first_name ?? "there",
      adminId: p.admin_id,
      emailPrefsDisabled: p.email_prefs_disabled ?? [],
      unsubscribeToken: p.unsubscribe_token ?? null,
    };
  }

  // Practice settings for each admin
  const adminIds = [
    ...new Set(
      Object.values(profileMap)
        .map((p) => p.adminId)
        .filter(Boolean),
    ),
  ];
  const { data: practiceRows } = await supabase
    .from("practice_settings")
    .select(
      "admin_id, counsellor_name, reminder_hours_before, reminder_email_subject, reminder_email_body, reminder_email_heading, disabled_email_types, payment_deadline_hours",
    )
    .in("admin_id", adminIds);

  const settingsMap: Record<
    string,
    {
      counsellorName: string | null;
      hoursBefore: number;
      subject: string | null;
      body: string | null;
      heading: string | null;
      disabledTypes: string[];
      paymentDeadlineHours: number;
    }
  > = {};
  for (const ps of practiceRows ?? []) {
    settingsMap[ps.admin_id] = {
      counsellorName: ps.counsellor_name ?? null,
      hoursBefore: ps.reminder_hours_before ?? DEFAULT_HOURS_BEFORE,
      subject: ps.reminder_email_subject ?? null,
      body: ps.reminder_email_body ?? null,
      heading: ps.reminder_email_heading ?? null,
      disabledTypes: ps.disabled_email_types ?? [],
      paymentDeadlineHours: ps.payment_deadline_hours ?? 48,
    };
  }

  // Client emails via auth admin API
  const emailMap: Record<string, string> = {};
  await Promise.all(
    clientIds.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user?.email) emailMap[id] = data.user.email;
    }),
  );

  // Keep only sessions that fall within their admin's configured reminder window
  const sessionsToRemind = sessions.filter((session: any) => {
    const profile = profileMap[session.client_id];
    if (!profile) return false;
    const hoursBefore = settingsMap[profile.adminId]?.hoursBefore ?? DEFAULT_HOURS_BEFORE;
    const targetMs = now + hoursBefore * 3600 * 1000;
    const diffHours = Math.abs(new Date(session.scheduled_at).getTime() - targetMs) / 3600000;
    return diffHours <= WINDOW_HALF_HOURS;
  });

  if (sessionsToRemind.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No sessions matched reminder windows" }), { status: 200 });
  }

  const results = await Promise.allSettled(
    sessionsToRemind.map(async (session: any) => {
      const toEmail = emailMap[session.client_id];
      if (!toEmail) throw new Error(`No email for client ${session.client_id}`);

      const profile = profileMap[session.client_id];
      const firstName = profile?.firstName ?? "there";
      const adminSettings = profile?.adminId ? settingsMap[profile.adminId] : null;
      const hoursBefore = adminSettings?.hoursBefore ?? DEFAULT_HOURS_BEFORE;

      const dateStr = formatDate(session.scheduled_at);
      const daysBefore = Math.round(hoursBefore / 24);
      const timeLabel =
        daysBefore >= 1
          ? `${daysBefore} day${daysBefore !== 1 ? "s" : ""}`
          : `${hoursBefore} hour${hoursBefore !== 1 ? "s" : ""}`;

      const baseSubject = adminSettings?.subject
        ? (adminSettings.subject ?? `Reminder: your session on ${dateStr}`).replace(/\{\{date\}\}/gi, dateStr)
        : session.paid
          ? `Reminder: your session on ${dateStr}`
          : `Action needed: please pay for your session on ${dateStr}`;

      const logBase = {
        adminId: profile?.adminId ?? null,
        clientId: session.client_id,
        sessionId: session.id,
        emailType: EMAIL_TYPE,
        recipientEmail: toEmail,
        subject: baseSubject,
      };

      // Admin-level disable
      if (adminSettings?.disabledTypes.includes(EMAIL_TYPE)) {
        await logEmail(supabase, { ...logBase, status: "skipped" });
        return;
      }

      // Client-level disable
      if ((profile?.emailPrefsDisabled ?? []).includes(EMAIL_TYPE)) {
        await logEmail(supabase, { ...logBase, status: "skipped" });
        return;
      }

      const locationLabel = session.location !== "in_person" ? "Online" : "In person";
      const sessionDetails = detailsTable([
        { label: "Date & time", value: dateStr, bold: true },
        { label: "Duration", value: `${session.duration_minutes} minutes` },
        { label: "Location", value: locationLabel },
      ]);

      let body: string;

      if (adminSettings?.body) {
        const interpolated = adminSettings.body
          .replace(/\{\{name\}\}/gi, firstName)
          .replace(/\{\{date\}\}/gi, dateStr)
          .replace(/\{\{location\}\}/gi, locationLabel)
          .replace(/\{\{duration\}\}/gi, `${session.duration_minutes} minutes`);
        body = para(interpolated) + sessionDetails;
      } else if (session.paid) {
        body =
          para(`This is a friendly reminder that you have a confirmed session coming up in ${timeLabel}.`) +
          sessionDetails +
          noteBox("If you need to cancel or reschedule, please do so at least 48 hours before your session.");
      } else {
        const deadlineHours = adminSettings?.paymentDeadlineHours ?? 48;
        const deadlineDays = Math.round(deadlineHours / 24);
        const deadlineLabel =
          deadlineHours >= 24 ? `${deadlineDays} day${deadlineDays !== 1 ? "s" : ""}` : `${deadlineHours} hours`;
        body =
          para(
            `You have a session coming up in ${timeLabel}. <strong style="color:#2d2926;">Your session has not been paid yet.</strong> Please pay at least ${deadlineLabel} before your session to keep your booking.`,
          ) +
          sessionDetails +
          noteBox(
            `Sessions that remain unpaid within ${deadlineLabel} may be cancelled. If you have questions, please contact your therapist.`,
          );
      }

      const heading = adminSettings?.heading
        ? adminSettings.heading.replace(/\{\{name\}\}/gi, firstName)
        : `Hi ${firstName},`;

      const unsubscribeUrl = profile?.unsubscribeToken
        ? `${appUrl}/unsubscribe?token=${profile.unsubscribeToken}&type=${EMAIL_TYPE}`
        : undefined;

      const html = emailTemplate({
        label: "Session Reminder",
        title: heading,
        body,
        ...(!session.paid ? { cta: { label: "Pay now", url: `${appUrl}/my-sessions` } } : {}),
        footerNote: "You received this email because you have a session booked through the WithMe portal.",
        unsubscribeUrl,
        counsellorName: adminSettings?.counsellorName ?? undefined,
      });

      let resendId: string | null = null;
      try {
        resendId = await sendEmail({ to: toEmail, subject: baseSubject, html, resendKey, fromEmail });
      } catch (sendErr: any) {
        await logEmail(supabase, { ...logBase, status: "failed", errorMessage: sendErr.message });
        throw sendErr;
      }

      await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) failed.forEach((f) => console.error(f.reason));

  return new Response(JSON.stringify({ sent, failed: failed.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
