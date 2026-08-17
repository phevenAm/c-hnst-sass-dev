// Client-side mirror of supabase/functions/_shared/email.ts
// Used for live email preview rendering in Settings

export function para(text: string): string {
  return `<p style="font-family:Arial,sans-serif;font-size:15px;color:#4a4744;line-height:1.8;margin:0 0 24px;">${text}</p>`;
}

export function detailsTable(rows: { label: string; value: string; bold?: boolean }[]): string {
  const cells = rows
    .map(
      (r) => `<tr>
    <td style="font-family:Arial,sans-serif;font-size:14px;color:#9e9894;padding:6px 0;width:140px;vertical-align:top;">${r.label}</td>
    <td style="font-family:Arial,sans-serif;font-size:14px;color:#2d2926;padding:6px 0;${r.bold ? "font-weight:700;" : ""}">${r.value}</td>
  </tr>`,
    )
    .join("");
  return `<div style="background:#f3f0eb;border-radius:10px;padding:18px 22px;margin:0 0 24px;">
  <table style="width:100%;border-collapse:collapse;">${cells}</table>
</div>`;
}

export function noteBox(text: string): string {
  return `<div style="background:#f3f0eb;border-left:3px solid #8bb898;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 8px;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#6b6460;line-height:1.65;margin:0;">${text}</p>
</div>`;
}

export function emailTemplate({
  label,
  title,
  body,
  cta,
  footerNote,
  unsubscribeUrl,
  counsellorName,
}: {
  label: string;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  footerNote: string;
  unsubscribeUrl?: string;
  counsellorName?: string;
}): string {
  const ctaBlock = cta
    ? `<div style="text-align:center;margin:0 0 28px;">
        <a href="${cta.url}" style="display:inline-block;background:#5a8a6a;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;letter-spacing:0.01em;">
          ${cta.label} &rarr;
        </a>
      </div>`
    : "";

  const counsellorLine = counsellorName
    ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#706c68;margin:0 0 10px;">Sent on behalf of <strong style="color:#9e9894;">${counsellorName}</strong>.</p>`
    : "";

  const unsubscribeLine = unsubscribeUrl
    ? `<p style="font-family:Arial,sans-serif;font-size:11px;color:#5a5652;margin:10px 0 0;">
        Don&rsquo;t want this type of email?
        <a href="${unsubscribeUrl}" style="color:#8bb898;text-decoration:underline;">Unsubscribe</a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${label}</title>
</head>
<body style="margin:0;padding:0;background:#f3f0eb;">
<div style="background:#f3f0eb;padding:40px 16px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#8bb898;border-radius:14px 14px 0 0;padding:28px 40px;text-align:center;">
      <div style="display:inline-block;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.25);line-height:44px;text-align:center;margin-bottom:12px;">
        <span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#ffffff;">C</span>
      </div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#ffffff;margin:0;letter-spacing:0.03em;">Clarity</h1>
      <p style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.8);margin:5px 0 0;">Counselling practice management</p>
    </div>
    <div style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e0dbd4;border-right:1px solid #e0dbd4;">
      <p style="font-family:Arial,sans-serif;font-size:12px;color:#9e9894;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em;">${label}</p>
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#2d2926;margin:0 0 20px;line-height:1.35;">${title}</h2>
      ${body}
      ${ctaBlock}
    </div>
    <div style="background:#2d2926;border-radius:0 0 14px 14px;padding:24px 40px;">
      <p style="font-family:Georgia,serif;font-size:14px;color:#f0ece8;font-weight:600;margin:0 0 12px;">Clarity</p>
      ${counsellorLine}
      <p style="font-family:Arial,sans-serif;font-size:12px;color:#706c68;line-height:1.7;margin:0 0 14px;">${footerNote}</p>
      <div style="border-top:1px solid #3a3834;padding-top:12px;">
        ${unsubscribeLine}
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

// ── Example previews ──────────────────────────────────────────────────────────

const EXAMPLE_DATE = "Monday 10 August 2026 at 2:00pm";
const EXAMPLE_NAME = "Alex";
const APP_URL = "#";

export function previewSessionReminder(customBody?: string, hoursBefore = 120, heading?: string): string {
  const daysBefore = Math.round(hoursBefore / 24);
  const timeLabel = daysBefore >= 1 ? `${daysBefore} day${daysBefore !== 1 ? "s" : ""}` : `${hoursBefore} hours`;

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

  return emailTemplate({
    label: "Session Reminder",
    title: heading ? heading.replace(/\{\{name\}\}/gi, EXAMPLE_NAME) : `Hi ${EXAMPLE_NAME},`,
    body,
    footerNote: "You received this email because you have a session booked through Clarity.",
  });
}

export function previewSessionBooked(): string {
  return emailTemplate({
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
    cta: { label: "View my sessions", url: APP_URL },
    footerNote: "You received this email because a session was booked for you through Clarity.",
  });
}

export function previewSessionCancelled(): string {
  return emailTemplate({
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
    footerNote: "You received this email because a session was cancelled through Clarity.",
  });
}

export function previewSessionRescheduled(): string {
  return emailTemplate({
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
    cta: { label: "View my sessions", url: APP_URL },
    footerNote: "You received this email because your session was rescheduled through Clarity.",
  });
}

export function previewPaymentReceived(): string {
  return emailTemplate({
    label: "Payment Confirmed",
    title: `Hi ${EXAMPLE_NAME},`,
    body:
      para(
        `Your payment of <strong style="color:#2d2926;">£60.00</strong> has been received for a session on ${EXAMPLE_DATE}.`,
      ) +
      detailsTable([
        { label: "Amount paid", value: "£60.00" },
        { label: "Session", value: EXAMPLE_DATE },
      ]),
    cta: { label: "View my sessions", url: APP_URL },
    footerNote: "You received this email because your payment was confirmed through Clarity.",
  });
}
