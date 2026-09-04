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
  // The page ground is a warm stone; the card is pure white and carries a
  // hairline border on all four sides, so the body always reads as its own
  // panel instead of blending into the page.
  pageBg: "#e9e6da",
  cardBg: "#ffffff",
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

// Dark-mode palette — mirrors `.dark` in src/styles/_colors.scss. The header
// and footer are already dark teal in both modes, so only the page ground,
// the body card, the detail/note panels and the text tones need to flip.
// Applied three ways, because no single mechanism covers every inbox:
//   • <style> @media (prefers-color-scheme:dark) — Apple Mail, iOS Mail, the
//     newer Outlook builds. Targets the .em-* classes added below.
//   • [data-ogsc]/[data-ogsb] — the attributes Outlook's iOS/Android apps
//     stamp on elements when they invert.
//   • bgcolor="" attributes on every structural cell — Gmail ignores the
//     first two and runs its own contrast inversion; an explicit bgcolor is
//     what makes that inversion land on a readable pairing instead of
//     leaving dark text on a stripped (transparent) card.
const D = {
  pageBg: "#0d1a17",
  cardBg: "#1a2d29",
  panel: "#22403b",
  hairline: "#254f49",
  text: "#ecf5f3",
  textSecondary: "#a8c8c2",
  textMuted: "#6fa49c",
  caption: "#8faaa4",
  link: "#7fc9bd",
};

const HEAD_STYLE = `<style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .em-bg      { background: ${D.pageBg} !important; }
      .em-card    { background: ${D.cardBg} !important; border-color: ${D.hairline} !important; }
      .em-panel   { background: ${D.panel} !important; }
      .em-text    { color: ${D.text} !important; }
      .em-text-2  { color: ${D.textSecondary} !important; }
      .em-text-3  { color: ${D.textMuted} !important; }
      .em-caption { color: ${D.caption} !important; }
      .em-hair    { border-color: ${D.hairline} !important; }
      a.em-link   { color: ${D.link} !important; }
    }
    [data-ogsb] .em-bg    { background: ${D.pageBg} !important; }
    [data-ogsb] .em-card  { background: ${D.cardBg} !important; }
    [data-ogsb] .em-panel { background: ${D.panel} !important; }
    [data-ogsc] .em-text    { color: ${D.text} !important; }
    [data-ogsc] .em-text-2  { color: ${D.textSecondary} !important; }
    [data-ogsc] .em-text-3  { color: ${D.textMuted} !important; }
    [data-ogsc] .em-caption { color: ${D.caption} !important; }
  </style>`;

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

// The Clarity sprout mark (white, on the teal header). Hosted in the public
// `logos` Storage bucket so it resolves in every inbox regardless of the
// app deploy; override with the EMAIL_LOGO_URL secret if it ever moves.
const LOGO_URL =
  Deno.env.get("EMAIL_LOGO_URL") ||
  "https://mxyfdvfbdrusbjiozuzx.supabase.co/storage/v1/object/public/logos/system/email-logo.png";

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
        <tr><td bgcolor="${C.accent}" style="border-radius:999px;background:${C.accent};">
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
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${label}</title>
  ${HEAD_STYLE}
</head>
<body class="em-bg" style="margin:0;padding:0;background:${C.pageBg};-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.pageBg}" class="em-bg" style="background:${C.pageBg};">
  <tr>
    <td align="center" style="padding:36px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;border-radius:14px;box-shadow:0 12px 32px rgba(26,58,53,0.14);">

        <!-- Header -->
        <tr>
          <td bgcolor="${C.header}" style="background:${C.header};border-radius:14px 14px 0 0;padding:22px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="${LOGO_URL}" width="26" height="26" alt="" style="display:block;border:0;" />
                </td>
                <td style="vertical-align:middle;font-family:${SERIF};font-size:21px;font-weight:400;color:#ffffff;letter-spacing:-0.01em;">Clarity</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td bgcolor="${C.cardBg}" class="em-card" style="background:${C.cardBg};padding:36px 40px 30px;border:1px solid ${C.hairline};border-top:0;border-bottom:0;">
            <p class="em-caption" style="font-family:${SANS};font-size:11px;font-weight:600;color:${C.caption};margin:0 0 10px;text-transform:uppercase;letter-spacing:0.12em;">${label}</p>
            <h2 class="em-text" style="font-family:${SERIF};font-size:24px;font-weight:400;color:${C.text};margin:0 0 20px;line-height:1.35;">${title}</h2>
            ${body}
            ${ctaBlock}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td bgcolor="${C.footer}" style="background:${C.footer};border-radius:0 0 14px 14px;padding:26px 40px;">
            <p style="font-family:${SERIF};font-size:16px;color:${C.onDark};font-weight:400;margin:0 0 14px;letter-spacing:-0.01em;">Clarity</p>
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
      const last = i === rows.length - 1;
      const border = last ? "" : `border-bottom:1px solid ${C.hairline};`;
      const hair = last ? "" : " em-hair";
      return `<tr>
    <td class="em-caption${hair}" style="font-family:${SANS};font-size:13px;color:${C.caption};padding:9px 16px 9px 0;width:130px;vertical-align:top;white-space:nowrap;${border}">${r.label}</td>
    <td class="em-text${hair}" style="font-family:${SANS};font-size:14px;color:${C.text};padding:9px 0;vertical-align:top;word-break:break-word;${r.bold ? "font-weight:700;" : ""}${border}">${r.value}</td>
  </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.panel}" class="em-panel" style="background:${C.panel};border-radius:10px;padding:6px 20px;margin:0 0 24px;border-collapse:separate;">
  ${cells}
</table>`;
}

/** A muted callout, teal keyline on the left. */
export function noteBox(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
  <tr><td bgcolor="${C.panel}" class="em-panel em-text-3" style="background:${C.panel};border-left:3px solid ${C.link};border-radius:0 8px 8px 0;padding:14px 18px;font-family:${SANS};font-size:13px;color:${C.textMuted};line-height:1.65;">${text}</td></tr>
</table>`;
}

/** A body paragraph. */
export function para(text: string): string {
  return `<p class="em-text-2" style="font-family:${SANS};font-size:15px;color:${C.textSecondary};line-height:1.7;margin:0 0 22px;">${text}</p>`;
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
  /** Base64 attachments (no data: prefix), e.g. an invoice PDF. */
  attachments?: { filename: string; content: string }[];
}): Promise<string> {
  const payload: Record<string, unknown> = {
    from: opts.fromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) payload.text = opts.text;
  if (opts.attachments?.length) payload.attachments = opts.attachments;

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
