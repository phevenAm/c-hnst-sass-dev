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
  <meta name="color-scheme" content="light" />
  <title>${label}</title>
</head>
<body style="margin:0;padding:0;background:#f3f0eb;">
<div style="background:#f3f0eb;padding:40px 16px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;">

    <!-- Header -->
    <div style="background:#8bb898;border-radius:14px 14px 0 0;padding:28px 40px;text-align:center;">
      <div style="display:inline-block;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.25);line-height:44px;text-align:center;margin-bottom:12px;">
        <span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#ffffff;">C</span>
      </div>
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#ffffff;margin:0;letter-spacing:0.03em;">Clarity</h1>
      <p style="font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.8);margin:5px 0 0;">Counselling practice management</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e0dbd4;border-right:1px solid #e0dbd4;">
      <p style="font-family:Arial,sans-serif;font-size:12px;color:#9e9894;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.1em;">${label}</p>
      <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;color:#2d2926;margin:0 0 20px;line-height:1.35;">${title}</h2>
      ${body}
      ${ctaBlock}
    </div>

    <!-- Footer -->
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
</body>
</html>`;
}

/** Renders a styled details table */
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

/** Renders a muted info box */
export function noteBox(text: string): string {
  return `<div style="background:#f3f0eb;border-left:3px solid #8bb898;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 8px;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#6b6460;line-height:1.65;margin:0;">${text}</p>
</div>`;
}

/** Renders a body paragraph */
export function para(text: string): string {
  return `<p style="font-family:Arial,sans-serif;font-size:15px;color:#4a4744;line-height:1.8;margin:0 0 24px;">${text}</p>`;
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
