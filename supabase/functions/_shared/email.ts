// ============================================================
// Shared transactional-email builder — Clarity brand.
//
// Palette mirrors src/styles/_colors.scss (the "Clarity teal/sage"
// system): deep teal greens, warm ivories, earthy neutrals.
//   teal-900 #1a3a35   footer
//   teal-800 #1f4940   header + buttons (primary accent)
//   teal-600 #2d7264   links
//   teal-50  #f0f9f7   detail panel / note box fill
//   warm-900 #2d2520   body text
//   warm-700 #5c4f48   secondary text
//   warm-600 #7a6e67   captions
//   warm-200 #e5e0dc   hairlines
//   warm-100 #f5f5ee   page background
//   ivory    #fffdf9   card background
//
// Every string that renders in a client's inbox lives here or is passed
// in by the caller — there are no hard-coded practice or person names.
// "Sent on behalf of <name>" uses practice_settings.counsellor_name,
// which each practice sets for itself.
// ============================================================

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

export type EmailTemplateOptions = {
  label: string;
  title: string;
  body: string;
  cta?: { label: string; url: string };
  footerNote: string;
  unsubscribeUrl?: string;
  counsellorName?: string;
};

export function emailTemplate({
  label,
  title,
  body,
  cta,
  footerNote,
  unsubscribeUrl,
  counsellorName,
}: EmailTemplateOptions): string {
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

        <!-- Header -->
        <tr>
          <td style="background:${C.header};border-radius:14px 14px 0 0;padding:30px 40px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
              <tr><td style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.14);text-align:center;font-family:${SERIF};font-size:19px;font-weight:700;color:#ffffff;line-height:42px;">C</td></tr>
            </table>
            <h1 style="font-family:${SERIF};font-size:20px;font-weight:600;color:#ffffff;margin:0;letter-spacing:0.02em;">Clarity</h1>
            <p style="font-family:${SANS};font-size:12px;color:rgba(255,255,255,0.7);margin:5px 0 0;letter-spacing:0.02em;">Counselling practice management</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:${C.cardBg};padding:36px 40px 30px;border-left:1px solid ${C.hairline};border-right:1px solid ${C.hairline};">
            <p style="font-family:${SANS};font-size:11px;font-weight:600;color:${C.caption};margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">${label}</p>
            <h2 style="font-family:${SERIF};font-size:23px;font-weight:500;color:${C.text};margin:0 0 20px;line-height:1.35;">${title}</h2>
            ${body}
            ${ctaBlock}
          </td>
        </tr>

        <!-- Footer -->
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
</body>
</html>`;
}

/** A key/value panel. Labels sit in a fixed left column; long values wrap
 *  under themselves, not under the label. Rows are hairline-separated. */
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

/** A muted callout, teal keyline on the left. */
export function noteBox(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td style="background:${C.panel};border-left:3px solid ${C.link};border-radius:0 8px 8px 0;padding:14px 18px;font-family:${SANS};font-size:13px;color:${C.textMuted};line-height:1.65;">${text}</td></tr>
</table>`;
}

/** A body paragraph. */
export function para(text: string): string {
  return `<p style="font-family:${SANS};font-size:15px;color:${C.textSecondary};line-height:1.7;margin:0 0 22px;">${text}</p>`;
}

/** Formats an ISO date string for UK display in Europe/London timezone */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

/**
 * Sends an email via the Resend API.
 * Returns the Resend email ID on success (for logging).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  resendKey: string;
  fromEmail: string;
}): Promise<string> {
  const payload: Record<string, unknown> = {
    from: opts.fromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) payload.text = opts.text;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.resendKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  return json.id as string;
}

/** Inserts a row into email_logs using the service-role Supabase client. */
export async function logEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    adminId?: string | null;
    clientId?: string | null;
    sessionId?: string | null;
    stubSessionId?: string | null;
    emailType: string;
    recipientEmail: string;
    subject: string;
    resendEmailId?: string | null;
    status: "sent" | "failed" | "skipped";
    errorMessage?: string | null;
  },
): Promise<void> {
  await supabase.from("email_logs").insert({
    admin_id: opts.adminId ?? null,
    client_id: opts.clientId ?? null,
    session_id: opts.sessionId ?? null,
    stub_session_id: opts.stubSessionId ?? null,
    email_type: opts.emailType,
    recipient_email: opts.recipientEmail,
    subject: opts.subject,
    resend_email_id: opts.resendEmailId ?? null,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
  });
}
