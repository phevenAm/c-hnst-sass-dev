import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, noteBox, para, sendEmail } from "../_shared/email.ts";

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

  // Client profiles → get first_name + admin_id
  const { data: profiles } = await supabase.from("users").select("id, first_name, admin_id").in("id", clientIds);

  const profileMap: Record<string, { firstName: string; adminId: string }> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = { firstName: p.first_name ?? "there", adminId: p.admin_id };
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
    .select("admin_id, reminder_hours_before, reminder_email_subject, reminder_email_body")
    .in("admin_id", adminIds);

  const settingsMap: Record<string, { hoursBefore: number; subject: string | null; body: string | null }> = {};
  for (const ps of practiceRows ?? []) {
    settingsMap[ps.admin_id] = {
      hoursBefore: ps.reminder_hours_before ?? DEFAULT_HOURS_BEFORE,
      subject: ps.reminder_email_subject ?? null,
      body: ps.reminder_email_body ?? null,
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
      const locationLabel = session.location !== "in_person" ? "Online" : "In person";
      const daysBefore = Math.round(hoursBefore / 24);
      const timeLabel =
        daysBefore >= 1
          ? `${daysBefore} day${daysBefore !== 1 ? "s" : ""}`
          : `${hoursBefore} hour${hoursBefore !== 1 ? "s" : ""}`;

      const sessionDetails = detailsTable([
        { label: "Date & time", value: dateStr, bold: true },
        { label: "Duration", value: `${session.duration_minutes} minutes` },
        { label: "Location", value: locationLabel },
      ]);

      let subject: string;
      let body: string;

      if (adminSettings?.body) {
        // Custom template — interpolate placeholders
        const interpolated = adminSettings.body
          .replace(/\{\{name\}\}/gi, firstName)
          .replace(/\{\{date\}\}/gi, dateStr)
          .replace(/\{\{location\}\}/gi, locationLabel)
          .replace(/\{\{duration\}\}/gi, `${session.duration_minutes} minutes`);
        body = para(interpolated) + sessionDetails;
        subject = (adminSettings.subject ?? `Reminder: your session on ${dateStr}`).replace(/\{\{date\}\}/gi, dateStr);
      } else if (session.paid) {
        subject = `Reminder: your session on ${dateStr}`;
        body =
          para(`This is a friendly reminder that you have a confirmed session coming up in ${timeLabel}.`) +
          sessionDetails +
          noteBox("If you need to cancel or reschedule, please do so at least 48 hours before your session.");
      } else {
        subject = `Action needed: please pay for your session on ${dateStr}`;
        body =
          para(
            `You have a session coming up in ${timeLabel}. <strong style="color:#2d2926;">Your session has not been paid yet.</strong> Please pay at least 48 hours before your session to keep your booking.`,
          ) +
          sessionDetails +
          noteBox(
            "Sessions that remain unpaid within 48 hours may be cancelled. If you have questions, please reply to this email.",
          );
      }

      const html = emailTemplate({
        label: "Session Reminder",
        title: `Hi ${firstName},`,
        body,
        ...(!session.paid ? { cta: { label: "Pay now", url: `${appUrl}/my-sessions` } } : {}),
        footerNote: "This email was sent because you have a session booked through the WithMe portal.",
      });

      await sendEmail({ to: toEmail, subject, html, resendKey, fromEmail });
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) failed.forEach((f) => console.error(f.reason));

  return new Response(JSON.stringify({ sent, failed: failed.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
