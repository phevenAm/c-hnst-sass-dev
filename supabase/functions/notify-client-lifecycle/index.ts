import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, noteBox, para, sendEmail } from "../_shared/email.ts";
import { buildLifecycleEmail, isValidEvent, LIFECYCLE_EMAIL_TYPE, lifecycleSkipReason } from "./lifecycleEmail.ts";

// Fired from SQL (admin_archive_client / admin_unarchive_client /
// delete_own_account) via net.http_post with an internal secret. Emails the
// client when their account is deactivated, reactivated, or closed.
//
// The calling SQL passes `client_email` explicitly and BEFORE any
// anonymisation runs, because anonymise_client() overwrites auth.users.email
// with a per-user sentinel — by the time this function runs, re-reading the
// address would give the unreachable `…@deleted.invalid` value.

const INTERNAL_SECRET = Deno.env.get("INTERNAL_CLIENT_LIFECYCLE_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const providedSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { event, user_id, client_email } = (await req.json()) as {
      event: unknown;
      user_id?: string;
      client_email?: string;
    };

    if (!isValidEvent(event) || !user_id) {
      return new Response(JSON.stringify({ error: "Missing or invalid event / user_id" }), { status: 400 });
    }

    // Prefer the address the SQL caller captured pre-anonymisation. Fall back
    // to auth.users only if it wasn't passed (older callers / manual invokes).
    let email = client_email ?? null;
    if (!email) {
      const { data: authResult } = await supabase.auth.admin.getUserById(user_id);
      email = authResult?.user?.email ?? null;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("first_name, admin_id")
      .eq("id", user_id)
      .maybeSingle();

    let counsellorName: string | undefined;
    let disabledEmailTypes: string[] = [];
    if (profile?.admin_id) {
      const { data: ps } = await supabase
        .from("practice_settings")
        .select("disabled_email_types, counsellor_name")
        .eq("admin_id", profile.admin_id)
        .maybeSingle();
      counsellorName = ps?.counsellor_name ?? undefined;
      disabledEmailTypes = ps?.disabled_email_types ?? [];
    }

    const skip = lifecycleSkipReason({ email, event, disabledEmailTypes });
    if (skip) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: skip }));
    }

    const content = buildLifecycleEmail({ event, firstName: profile?.first_name, appUrl });
    const html = emailTemplate({
      label: content.label,
      title: content.title,
      body: content.paras.map(para).join("") + content.notes.map(noteBox).join(""),
      cta: content.cta,
      footerNote: "You received this email because your account status changed on Clarity.",
      counsellorName,
    });

    const emailType = LIFECYCLE_EMAIL_TYPE[event];
    const recipient = email as string;

    let resendId: string | null = null;
    try {
      resendId = await sendEmail({ to: recipient, subject: content.subject, html, resendKey, fromEmail });
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await logEmail(supabase, {
        adminId: profile?.admin_id ?? null,
        clientId: user_id,
        emailType,
        recipientEmail: recipient,
        subject: content.subject,
        status: "failed",
        errorMessage: message,
      });
      throw sendErr;
    }

    const work: Promise<unknown>[] = [
      logEmail(supabase, {
        adminId: profile?.admin_id ?? null,
        clientId: user_id,
        emailType,
        recipientEmail: recipient,
        subject: content.subject,
        resendEmailId: resendId,
        status: "sent",
      }),
    ];

    // Only a reactivated client can actually sign in to see an in-app notice.
    if (event === "reactivated") {
      work.push(
        supabase.from("notifications").insert({
          user_id,
          type: "account_reactivated",
          message: "Your practitioner has reactivated your account — you can sign in again.",
        }),
      );
    }

    await Promise.all(work);

    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
