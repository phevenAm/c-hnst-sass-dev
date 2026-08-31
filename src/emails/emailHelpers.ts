// Client-side mirror of supabase/functions/_shared/email.ts — keep the two
// in lockstep. Used for the live email preview in Settings → Emails.
// Palette from src/styles/_colors.scss (Clarity teal/sage).

const C = {
  pageBg: "#f5f5ee",
  cardBg: "#fffdf9",
  header: "#1f4940",
  footer: "#1a3a35",
  accent: "#1f4940",
  link: "#2d7264",
  panel: "#f0f9f7",
  hairline: "#e5e0dc",
  text: "#2d2520",
  textSecondary: "#3d3530",
  textMuted: "#5c4f48",
  caption: "#7a6e67",
  onDark: "#eef4f1",
  onDarkMuted: "#9db3ac",
};

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export function para(text: string): string {
  return `<p style="font-family:${SANS};font-size:15px;color:${C.textSecondary};line-height:1.7;margin:0 0 22px;">${text}</p>`;
}

export function detailsTable(rows: { label: string; value: string; bold?: boolean }[]): string {
  const cells = rows
    .map((r, i) => {
      const border = i === rows.length - 1 ? "" : `border-bottom:1px solid ${C.hairline};`;
      return `<tr>
    <td style="font-family:${SANS};font-size:13px;color:${C.caption};padding:9px 16px 9px 0;width:130px;vertical-align:top;white-space:nowrap;${border}">${r.label}</td>
    <td style="font-family:${SANS};font-size:14px;color:${C.text};padding:9px 0;vertical-align:top;word-break:break-word;${r.bold ? "font-weight:700;" : ""}${border}">${r.value}</td>
  </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border-radius:10px;padding:6px 20px;margin:0 0 24px;border-collapse:separate;">
  ${cells}
</table>`;
}

export function noteBox(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td style="background:${C.panel};border-left:3px solid ${C.link};border-radius:0 8px 8px 0;padding:14px 18px;font-family:${SANS};font-size:13px;color:${C.textMuted};line-height:1.65;">${text}</td></tr>
</table>`;
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
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
        <tr><td style="border-radius:999px;background:${C.accent};">
          <a href="${cta.url}" style="display:inline-block;padding:13px 34px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;letter-spacing:0.01em;border-radius:999px;">${cta.label} &rarr;</a>
        </td></tr>
      </table>`
    : "";

  const counsellorLine = counsellorName
    ? `<p style="font-family:${SANS};font-size:12px;line-height:1.5;color:${C.onDarkMuted};margin:0 0 12px;">Sent on behalf of <strong style="color:${C.onDark};font-weight:600;">${counsellorName}</strong></p>`
    : "";

  const unsubscribeLine = unsubscribeUrl
    ? `<p style="font-family:${SANS};font-size:11px;line-height:1.5;color:${C.onDarkMuted};margin:12px 0 0;">
        Don&rsquo;t want this type of email?
        <a href="${unsubscribeUrl}" style="color:${C.onDark};text-decoration:underline;">Unsubscribe</a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${label}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;">

        <tr>
          <td style="background:${C.header};border-radius:14px 14px 0 0;padding:30px 40px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
              <tr><td style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.14);text-align:center;font-family:${SERIF};font-size:19px;font-weight:700;color:#ffffff;line-height:42px;">C</td></tr>
            </table>
            <h1 style="font-family:${SERIF};font-size:20px;font-weight:600;color:#ffffff;margin:0;letter-spacing:0.02em;">Clarity</h1>
            <p style="font-family:${SANS};font-size:12px;color:rgba(255,255,255,0.7);margin:5px 0 0;letter-spacing:0.02em;">Counselling practice management</p>
          </td>
        </tr>

        <tr>
          <td style="background:${C.cardBg};padding:36px 40px 30px;border-left:1px solid ${C.hairline};border-right:1px solid ${C.hairline};">
            <p style="font-family:${SANS};font-size:11px;font-weight:600;color:${C.caption};margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">${label}</p>
            <h2 style="font-family:${SERIF};font-size:23px;font-weight:500;color:${C.text};margin:0 0 20px;line-height:1.35;">${title}</h2>
            ${body}
            ${ctaBlock}
          </td>
        </tr>

        <tr>
          <td style="background:${C.footer};border-radius:0 0 14px 14px;padding:26px 40px;">
            <p style="font-family:${SERIF};font-size:15px;color:${C.onDark};font-weight:600;margin:0 0 14px;letter-spacing:0.02em;">Clarity</p>
            ${counsellorLine}
            <p style="font-family:${SANS};font-size:12px;color:${C.onDarkMuted};line-height:1.65;margin:0;">${footerNote}</p>
            ${unsubscribeLine ? `<table role="presentation" width="100%" style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.12);"><tr><td style="padding-top:12px;">${unsubscribeLine}</td></tr></table>` : ""}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
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
        `Your payment of <strong style="color:#2d2520;">£60.00</strong> has been received for a session on ${EXAMPLE_DATE}.`,
      ) +
      detailsTable([
        { label: "Amount paid", value: "£60.00" },
        { label: "Session", value: EXAMPLE_DATE },
      ]),
    cta: { label: "View my sessions", url: APP_URL },
    footerNote: "You received this email because your payment was confirmed through Clarity.",
  });
}
