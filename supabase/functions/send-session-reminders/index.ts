import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, formatDate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";

const REMINDER_TYPE = "session_reminder";
const CANCELLED_TYPE = "session_cancelled";
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
  const broadFrom = new Date(now + WINDOW_HALF_HOURS * 3600 * 1000).toISOString();
  const broadTo = new Date(now + 8 * 24 * 3600 * 1000).toISOString();

  // ── Load all upcoming sessions (wider window — includes deadline-cancel candidates) ──

  const { data: allSessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, scheduled_at, duration_minutes, paid, location, client_id")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", broadTo)
    .eq("status", "scheduled")
    .eq("send_reminders", true);

  if (sessionsError) {
    return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500 });
  }

  const sessions = allSessions ?? [];
  const clientIds = [...new Set(sessions.map((s: any) => s.client_id as string))];

  // ── Build profile + settings + email maps ─────────────────────────────────

  const profileMap: Record<
    string,
    { firstName: string; adminId: string; emailPrefsDisabled: string[]; unsubscribeToken: string | null }
  > = {};
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
  const emailMap: Record<string, string> = {};

  if (clientIds.length > 0) {
    const { data: profiles } = await supabase
      .from("users")
      .select("id, first_name, admin_id, email_prefs_disabled, unsubscribe_token")
      .in("id", clientIds);

    for (const p of profiles ?? []) {
      profileMap[p.id] = {
        firstName: p.first_name ?? "there",
        adminId: p.admin_id,
        emailPrefsDisabled: p.email_prefs_disabled ?? [],
        unsubscribeToken: p.unsubscribe_token ?? null,
      };
    }

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

    await Promise.all(
      clientIds.map(async (id) => {
        const { data } = await supabase.auth.admin.getUserById(id);
        if (data?.user?.email) emailMap[id] = data.user.email;
      }),
    );
  }

  // ── AUTO-CANCEL: real sessions past their payment deadline ─────────────────

  const autoCancelledIds = new Set<string>();
  let autoCancelEmailsSent = 0;

  await Promise.allSettled(
    sessions
      .filter((s: any) => !s.paid)
      .map(async (session: any) => {
        const profile = profileMap[session.client_id];
        if (!profile) return;

        const deadlineHours = settingsMap[profile.adminId]?.paymentDeadlineHours ?? 48;
        const msUntilSession = new Date(session.scheduled_at).getTime() - now;
        if (msUntilSession > deadlineHours * 3600 * 1000) return; // deadline not yet passed

        const { error } = await supabase
          .from("sessions")
          .update({ status: "cancelled" })
          .eq("id", session.id)
          .eq("status", "scheduled"); // guard against races
        if (error) return;

        autoCancelledIds.add(session.id);

        // Send cancellation email
        const toEmail = emailMap[session.client_id];
        if (!toEmail) return;

        const adminSettings = settingsMap[profile.adminId];
        if (adminSettings?.disabledTypes.includes(CANCELLED_TYPE)) return;
        if ((profile.emailPrefsDisabled ?? []).includes(CANCELLED_TYPE)) return;

        const dateStr = formatDate(session.scheduled_at);
        const subject = `Your session on ${dateStr} has been cancelled`;
        const unsubscribeUrl = profile.unsubscribeToken
          ? `${appUrl}/unsubscribe?token=${profile.unsubscribeToken}&type=${CANCELLED_TYPE}`
          : undefined;

        const html = emailTemplate({
          label: "Session Cancelled",
          title: `Hi ${profile.firstName}, your session has been cancelled`,
          body:
            para("The following session has been cancelled because payment was not received before the deadline:") +
            detailsTable([
              { label: "Date & time", value: dateStr, bold: true },
              { label: "Duration", value: `${session.duration_minutes} minutes` },
              { label: "Location", value: session.location !== "in_person" ? "Online" : "In person" },
            ]) +
            noteBox(
              "If you would like to rebook or have questions about payment, please contact your therapist directly.",
            ),
          footerNote: "You received this email because your session was cancelled due to non-payment.",
          unsubscribeUrl,
          counsellorName: adminSettings?.counsellorName ?? undefined,
        });

        try {
          const resendId = await sendEmail({ to: toEmail, subject, html, resendKey, fromEmail });
          await logEmail(supabase, {
            adminId: profile.adminId,
            clientId: session.client_id,
            sessionId: session.id,
            emailType: CANCELLED_TYPE,
            recipientEmail: toEmail,
            subject,
            resendEmailId: resendId,
            status: "sent",
          });
          autoCancelEmailsSent++;
        } catch (sendErr: any) {
          await logEmail(supabase, {
            adminId: profile.adminId,
            clientId: session.client_id,
            sessionId: session.id,
            emailType: CANCELLED_TYPE,
            recipientEmail: toEmail,
            subject,
            status: "failed",
            errorMessage: sendErr.message,
          });
        }
      }),
  );

  // ── REMINDERS: real sessions in the reminder window (skip auto-cancelled) ──

  const sessionsToRemind = sessions.filter((session: any) => {
    if (autoCancelledIds.has(session.id)) return false;
    const sessionMs = new Date(session.scheduled_at).getTime();
    if (sessionMs < new Date(broadFrom).getTime()) return false;

    const profile = profileMap[session.client_id];
    if (!profile) return false;
    const hoursBefore = settingsMap[profile.adminId]?.hoursBefore ?? DEFAULT_HOURS_BEFORE;
    const targetMs = now + hoursBefore * 3600 * 1000;
    return Math.abs(sessionMs - targetMs) / 3600000 <= WINDOW_HALF_HOURS;
  });

  const reminderResults = await Promise.allSettled(
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
        ? adminSettings.subject.replace(/\{\{date\}\}/gi, dateStr)
        : session.paid
          ? `Reminder: your session on ${dateStr}`
          : `Action needed: please pay for your session on ${dateStr}`;

      const logBase = {
        adminId: profile?.adminId ?? null,
        clientId: session.client_id,
        sessionId: session.id,
        emailType: REMINDER_TYPE,
        recipientEmail: toEmail,
        subject: baseSubject,
      };

      if (adminSettings?.disabledTypes.includes(REMINDER_TYPE)) {
        await logEmail(supabase, { ...logBase, status: "skipped" });
        return;
      }
      if ((profile?.emailPrefsDisabled ?? []).includes(REMINDER_TYPE)) {
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
        ? `${appUrl}/unsubscribe?token=${profile.unsubscribeToken}&type=${REMINDER_TYPE}`
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

  const sent = reminderResults.filter((r) => r.status === "fulfilled").length;
  const failed = reminderResults.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length) failed.forEach((f) => console.error(f.reason));

  // ── STUB sessions: auto-cancel + reminders ────────────────────────────────

  const { data: allStubSessions } = await supabase
    .from("stub_sessions")
    .select("id, scheduled_at, duration_minutes, location, amount_paid, admin_id, client_stubs(first_name, email)")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", broadTo)
    .eq("status", "scheduled");

  // Load settings for any admin_ids not yet in settingsMap
  const stubAdminIds = [...new Set((allStubSessions ?? []).map((ss: any) => ss.admin_id))].filter(
    (id) => !settingsMap[id],
  );
  if (stubAdminIds.length > 0) {
    const { data: extraSettings } = await supabase
      .from("practice_settings")
      .select(
        "admin_id, counsellor_name, reminder_hours_before, reminder_email_subject, reminder_email_body, reminder_email_heading, disabled_email_types, payment_deadline_hours",
      )
      .in("admin_id", stubAdminIds);
    for (const ps of extraSettings ?? []) {
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
  }

  const autoCancelledStubIds = new Set<string>();
  let stubAutoCancelEmailsSent = 0;

  // Auto-cancel unpaid stub sessions past deadline
  await Promise.allSettled(
    (allStubSessions ?? [])
      .filter((ss: any) => ss.amount_paid == null)
      .map(async (ss: any) => {
        const adminSettings = settingsMap[ss.admin_id];
        if (!adminSettings) return;

        const msUntilSession = new Date(ss.scheduled_at).getTime() - now;
        if (msUntilSession > adminSettings.paymentDeadlineHours * 3600 * 1000) return;

        const { error } = await supabase
          .from("stub_sessions")
          .update({ status: "cancelled" })
          .eq("id", ss.id)
          .eq("status", "scheduled");
        if (error) return;

        autoCancelledStubIds.add(ss.id);

        const stub = ss.client_stubs as { first_name: string; email: string | null } | null;
        if (!stub?.email) return;
        if (adminSettings.disabledTypes.includes(CANCELLED_TYPE)) return;

        const dateStr = formatDate(ss.scheduled_at);
        const subject = `Your session on ${dateStr} has been cancelled`;
        const isOnline = ss.location !== "in_person";

        const html = emailTemplate({
          label: "Session Cancelled",
          title: `Hi ${stub.first_name ?? "there"}, your session has been cancelled`,
          body:
            para("The following session has been cancelled because payment was not received before the deadline:") +
            detailsTable([
              { label: "Date & time", value: dateStr, bold: true },
              ...(ss.duration_minutes ? [{ label: "Duration", value: `${ss.duration_minutes} minutes` }] : []),
              { label: "Location", value: isOnline ? "Online" : "In person" },
            ]) +
            noteBox(
              "If you would like to rebook or have questions about payment, please contact your therapist directly.",
            ),
          footerNote: "You received this email because your session was cancelled due to non-payment.",
          counsellorName: adminSettings.counsellorName ?? undefined,
        });

        try {
          const resendId = await sendEmail({ to: stub.email, subject, html, resendKey, fromEmail });
          await logEmail(supabase, {
            adminId: ss.admin_id,
            clientId: null,
            sessionId: null,
            emailType: CANCELLED_TYPE,
            recipientEmail: stub.email,
            subject,
            resendEmailId: resendId,
            status: "sent",
          });
          stubAutoCancelEmailsSent++;
        } catch (sendErr: any) {
          await logEmail(supabase, {
            adminId: ss.admin_id,
            clientId: null,
            sessionId: null,
            emailType: CANCELLED_TYPE,
            recipientEmail: stub.email,
            subject,
            status: "failed",
            errorMessage: sendErr.message,
          });
        }
      }),
  );

  // Stub reminders (skip auto-cancelled)
  const stubResults = await Promise.allSettled(
    (allStubSessions ?? [])
      .filter((ss: any) => {
        if (autoCancelledStubIds.has(ss.id)) return false;
        const sessionMs = new Date(ss.scheduled_at).getTime();
        return sessionMs >= new Date(broadFrom).getTime();
      })
      .map(async (ss: any) => {
        const stub = ss.client_stubs as { first_name: string; email: string | null } | null;
        if (!stub?.email) return;

        const adminSettings = settingsMap[ss.admin_id];
        if (!adminSettings) return;
        if (adminSettings.disabledTypes.includes(REMINDER_TYPE)) return;

        const hoursBefore = adminSettings.hoursBefore ?? DEFAULT_HOURS_BEFORE;
        const targetMs = now + hoursBefore * 3600 * 1000;
        const diffHours = Math.abs(new Date(ss.scheduled_at).getTime() - targetMs) / 3600000;
        if (diffHours > WINDOW_HALF_HOURS) return;

        const dateStr = formatDate(ss.scheduled_at);
        const daysBefore = Math.round(hoursBefore / 24);
        const timeLabel =
          daysBefore >= 1
            ? `${daysBefore} day${daysBefore !== 1 ? "s" : ""}`
            : `${hoursBefore} hour${hoursBefore !== 1 ? "s" : ""}`;

        const firstName = stub.first_name ?? "there";
        const isOnline = ss.location !== "in_person";
        const isPaid = ss.amount_paid != null;

        const subject = adminSettings.subject
          ? adminSettings.subject.replace(/\{\{date\}\}/gi, dateStr)
          : isPaid
            ? `Reminder: your session on ${dateStr}`
            : `Action needed: please pay for your session on ${dateStr}`;

        const logBase = {
          adminId: ss.admin_id,
          clientId: null,
          sessionId: null,
          emailType: REMINDER_TYPE,
          recipientEmail: stub.email,
          subject,
        };

        const sessionDetails = detailsTable([
          { label: "Date & time", value: dateStr, bold: true },
          ...(ss.duration_minutes ? [{ label: "Duration", value: `${ss.duration_minutes} minutes` }] : []),
          { label: "Location", value: isOnline ? "Online" : "In person" },
        ]);

        let body: string;
        if (adminSettings.body) {
          const interpolated = adminSettings.body
            .replace(/\{\{name\}\}/gi, firstName)
            .replace(/\{\{date\}\}/gi, dateStr)
            .replace(/\{\{location\}\}/gi, isOnline ? "Online" : "In person")
            .replace(/\{\{duration\}\}/gi, ss.duration_minutes ? `${ss.duration_minutes} minutes` : "");
          body = para(interpolated) + sessionDetails;
        } else if (isPaid) {
          body =
            para(`This is a friendly reminder that you have a confirmed session coming up in ${timeLabel}.`) +
            sessionDetails +
            noteBox("If you need to cancel or reschedule, please contact your therapist directly.");
        } else {
          const deadlineHours = adminSettings.paymentDeadlineHours;
          const deadlineDays = Math.round(deadlineHours / 24);
          const deadlineLabel =
            deadlineHours >= 24 ? `${deadlineDays} day${deadlineDays !== 1 ? "s" : ""}` : `${deadlineHours} hours`;
          body =
            para(
              `You have a session coming up in ${timeLabel}. <strong style="color:#2d2926;">Payment has not yet been recorded for this session.</strong> Please pay at least ${deadlineLabel} before your session to keep your booking.`,
            ) +
            sessionDetails +
            noteBox("If you have any questions about payment, please contact your therapist directly.");
        }

        const heading = adminSettings.heading
          ? adminSettings.heading.replace(/\{\{name\}\}/gi, firstName)
          : `Hi ${firstName},`;

        const html = emailTemplate({
          label: "Session Reminder",
          title: heading,
          body,
          footerNote: "You received this email because you have a session booked.",
          counsellorName: adminSettings.counsellorName ?? undefined,
        });

        let resendId: string | null = null;
        try {
          resendId = await sendEmail({ to: stub.email, subject, html, resendKey, fromEmail });
        } catch (sendErr: any) {
          await logEmail(supabase, { ...logBase, status: "failed", errorMessage: sendErr.message });
          throw sendErr;
        }

        await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });
      }),
  );

  const stubSent = stubResults.filter((r) => r.status === "fulfilled").length;
  const stubFailed = stubResults.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (stubFailed.length) stubFailed.forEach((f) => console.error(f.reason));

  return new Response(
    JSON.stringify({
      reminders_sent: sent + stubSent,
      reminders_failed: failed.length + stubFailed.length,
      auto_cancelled: autoCancelledIds.size + autoCancelledStubIds.size,
      cancellation_emails_sent: autoCancelEmailsSent + stubAutoCancelEmailsSent,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
