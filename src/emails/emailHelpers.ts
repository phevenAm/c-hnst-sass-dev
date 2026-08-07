// Client-side mirror of supabase/functions/_shared/email.ts
// Used for live email preview rendering

export function para(text: string): string {
  return `<p style="font-family:system-ui,sans-serif;font-size:15px;color:#6b6460;line-height:1.75;margin:0 0 28px;">${text}</p>`;
}

export function detailsTable(rows: { label: string; value: string; bold?: boolean }[]): string {
  const cells = rows
    .map(
      (r) => `<tr>
    <td style="font-family:system-ui,sans-serif;font-size:14px;color:#9e9894;padding:5px 0;width:150px;vertical-align:top;">${r.label}</td>
    <td style="font-family:system-ui,sans-serif;font-size:14px;color:#2d2926;padding:5px 0;${r.bold ? "font-weight:600;" : ""}">${r.value}</td>
  </tr>`,
    )
    .join("");
  return `<div style="background:#f3f0eb;border-radius:12px;padding:20px 24px;margin:0 0 28px;">
  <table style="width:100%;border-collapse:collapse;">${cells}</table>
</div>`;
}

export function noteBox(text: string): string {
  return `<div style="background:#f3f0eb;border-radius:12px;padding:18px 22px;margin:0 0 8px;">
  <p style="font-family:system-ui,sans-serif;font-size:13px;color:#9e9894;line-height:1.6;margin:0;">${text}</p>
</div>`;
}

export function emailTemplate({
  label,
  title,
  body,
  cta,
  footerNote,
}: {
  label: string;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  footerNote: string;
}): string {
  const ctaBlock = cta
    ? `<div style="text-align:center;margin:0 0 28px;">
        <a href="${cta.url}" style="display:inline-block;background:#5a8a6a;color:#ffffff;font-family:system-ui,sans-serif;font-size:15px;font-weight:500;text-decoration:none;padding:14px 36px;border-radius:999px;letter-spacing:0.01em;">
          ${cta.label} &rarr;
        </a>
      </div>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;">
<div style="background:#f3f0eb;padding:40px 20px;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#8bb898;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
      <h1 style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#fff;margin:0;letter-spacing:0.02em;">WithMe</h1>
      <p style="font-size:13px;color:rgba(255,255,255,0.8);margin:6px 0 0;font-family:system-ui,sans-serif;">A safe space for your journey</p>
    </div>
    <div style="background:#ffffff;padding:44px 40px 36px;border-left:1px solid #e0dbd4;border-right:1px solid #e0dbd4;">
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:#9e9894;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.08em;">${label}</p>
      <h2 style="font-family:Georgia,serif;font-size:26px;font-weight:500;color:#2d2926;margin:0 0 20px;line-height:1.3;">${title}</h2>
      ${body}
      ${ctaBlock}
    </div>
    <div style="background:#2d2926;border-radius:0 0 16px 16px;padding:28px 40px;">
      <span style="font-family:Georgia,serif;font-size:14px;color:#f0ece8;font-weight:500;">WithMe</span>
      <p style="font-family:system-ui,sans-serif;font-size:12px;color:#706c68;line-height:1.7;margin:12px 0 0;">${footerNote}</p>
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
    footerNote: "This email was sent because you have a session booked through the WithMe portal.",
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
    footerNote: "This email was sent because a session was booked for you through the WithMe portal.",
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
    footerNote: "This email was sent because a session was cancelled through the WithMe portal.",
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
    footerNote: "This email was sent because your session was rescheduled through the WithMe portal.",
  });
}

export function previewPaymentReceived(): string {
  return emailTemplate({
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
    cta: { label: "View client page", url: APP_URL },
    footerNote: "This email was sent because a client completed a payment through the WithMe portal.",
  });
}
