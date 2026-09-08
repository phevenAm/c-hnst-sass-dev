import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_TYPE = "announcement";
const MAX_RECIPIENTS = 500;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ATTACHMENT_FETCH_TIMEOUT_MS = 10_000;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Plain text → template body: escape, keep paragraph breaks.
const bodyToHtml = (raw: string) =>
  raw
    .split(/\n{2,}/)
    .map((block) => para(escapeHtml(block).replace(/\n/g, "<br/>")))
    .join("");

// SSRF guard. `attachment_url` arrives in the request body, and without this
// the function would `fetch()` any URL server-side (cloud metadata, localhost,
// internal services) and base64 the response into an email the caller reads.
// The only legitimate value is a public URL for a PDF this same practice just
// uploaded to the `documents` bucket (see src/components/shared/PdfUpload:
// path is `<adminId>/<uuid>-<file>.pdf`). Lock to exactly that: same Supabase
// project, that bucket, this caller's own folder. `new URL()` normalises `..`
// and does not decode `%2f`, so path-traversal and encoded-slash tricks fail
// the prefix check.
function validatedAttachmentUrl(rawUrl: string, ownerId: string): URL {
  const base = new URL(Deno.env.get("SUPABASE_URL")!);
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid attachment URL");
  }
  const prefix = `/storage/v1/object/public/documents/${ownerId}/`;
  if (u.protocol !== "https:" || u.host !== base.host || !u.pathname.startsWith(prefix)) {
    throw new Error("Attachment must be a PDF uploaded to this practice's own documents");
  }
  return u;
}

async function fetchAttachment(url: URL): Promise<{ filename: string; content: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTACHMENT_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "error", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Attachment is larger than 15MB");
  let binary = "";
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "attachment.pdf");
  return { filename, content: btoa(binary) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Only admins send announcements.
    const { data: sender } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (sender?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { subject, body, recipient_ids, attachment_url } = await req.json();
    if (!subject?.trim() || !body?.trim()) {
      return new Response(JSON.stringify({ error: "Subject and message are required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Pick at least one recipient" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (recipient_ids.length > MAX_RECIPIENTS) {
      return new Response(JSON.stringify({ error: `Too many recipients (max ${MAX_RECIPIENTS})` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Only this practice's own, active clients — silently drops anything else
    // the caller may have passed.
    const { data: allMatched } = await supabase
      .from("users")
      .select("id, first_name, email, disabled, email_prefs_disabled, unsubscribe_token")
      .in("id", recipient_ids)
      .eq("admin_id", user.id)
      .eq("role", "client");
    // Paused/disabled clients don't get practice mail.
    const clients = (allMatched ?? []).filter((c) => !c.disabled);

    const { data: ps } = await supabase
      .from("practice_settings")
      .select("counsellor_name, business_name")
      .eq("admin_id", user.id)
      .maybeSingle();
    const practiceName = ps?.business_name || ps?.counsellor_name || "Your counsellor";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;

    let attachments: { filename: string; content: string }[] | undefined;
    if (attachment_url) {
      let safeUrl: URL;
      try {
        safeUrl = validatedAttachmentUrl(String(attachment_url), user.id);
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid attachment" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      const a = await fetchAttachment(safeUrl);
      if (a) attachments = [a];
    }

    let sent = 0;
    let skipped = 0;

    for (const c of clients) {
      if (!c.email || (c.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
        skipped++;
        await logEmail(supabase, {
          adminId: user.id,
          clientId: c.id,
          emailType: EMAIL_TYPE,
          recipientEmail: c.email ?? "(none)",
          subject,
          status: "skipped",
        });
        continue;
      }

      const unsubscribeUrl = c.unsubscribe_token
        ? `${appUrl}/unsubscribe?token=${c.unsubscribe_token}&type=${EMAIL_TYPE}`
        : undefined;

      const html = emailTemplate({
        label: "Announcement",
        title: subject,
        body: bodyToHtml(body),
        footerNote: `You received this because you're a client of ${escapeHtml(practiceName)} on Clarity.`,
        unsubscribeUrl,
        counsellorName: ps?.counsellor_name ?? undefined,
      });

      const payload: Record<string, unknown> = { from: fromEmail, to: c.email, subject, html };
      if (attachments) payload.attachments = attachments;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        sent++;
        await logEmail(supabase, {
          adminId: user.id,
          clientId: c.id,
          emailType: EMAIL_TYPE,
          recipientEmail: c.email,
          subject,
          resendEmailId: json.id ?? null,
          status: "sent",
        });
      } else {
        skipped++;
        await logEmail(supabase, {
          adminId: user.id,
          clientId: c.id,
          emailType: EMAIL_TYPE,
          recipientEmail: c.email,
          subject,
          status: "failed",
          errorMessage: `Resend ${res.status}: ${await res.text()}`,
        });
      }
    }

    await supabase.from("announcements").insert({
      admin_id: user.id,
      subject,
      body,
      attachment_url: attachment_url || null,
      recipient_ids,
      recipient_count: recipient_ids.length,
      sent_count: sent,
      skipped_count: skipped,
    });

    return new Response(JSON.stringify({ ok: true, sent, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
