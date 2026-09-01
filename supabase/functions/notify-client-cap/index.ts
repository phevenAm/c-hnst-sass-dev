import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

// Daily nudge: email an admin when they're within one client of their plan's
// active-client cap, or over it. Invoked by pg_cron (trigger_client_cap_warnings)
// with an x-internal-secret header. Deduped per admin on a 14-day cooldown via
// email_logs, and skippable via users.email_prefs_disabled.

const EMAIL_TYPE = "client_cap_warning";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_CLIENT_CAP_SECRET") ?? "";
const COOLDOWN_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  if (!INTERNAL_SECRET || (req.headers.get("x-internal-secret") ?? "") !== INTERNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!resendKey || !fromEmail) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL" }), { status: 500 });
  }

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings, error: sErr } = await supabase
    .from("practice_settings")
    .select("admin_id, subscription_plan, subscription_status, counsellor_name")
    .in("subscription_status", ["active", "trialing"]);
  if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 500 });

  const { data: limits } = await supabase.from("plan_limits").select("plan, max_active");
  const maxByPlan = new Map<string, number | null>(
    (limits ?? []).map((l: { plan: string; max_active: number | null }) => [l.plan, l.max_active]),
  );

  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();
  const notified: unknown[] = [];

  for (const ps of settings ?? []) {
    const max = maxByPlan.get(ps.subscription_plan);
    if (max == null) continue; // unlimited plan or unknown

    const { data: active } = await supabase.rpc("active_client_count", { p_admin: ps.admin_id });
    if (typeof active !== "number" || active < max - 1) continue; // only 1-slot-left or over

    const { data: admin } = await supabase
      .from("users")
      .select("email, email_prefs_disabled, unsubscribe_token")
      .eq("id", ps.admin_id)
      .single();
    if (!admin?.email) continue;
    if ((admin.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) continue;

    const { data: recent } = await supabase
      .from("email_logs")
      .select("id")
      .eq("admin_id", ps.admin_id)
      .eq("email_type", EMAIL_TYPE)
      .eq("status", "sent")
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) continue;

    const over = active > max;
    const subject = over
      ? `You're over your ${ps.subscription_plan} plan's client limit`
      : `You're using ${active} of ${max} client slots`;

    const html = emailTemplate({
      label: "Subscription",
      title: over ? "You're over your plan's client limit" : "You're almost at your client limit",
      body:
        para(
          over
            ? `You now have <strong>${active} active clients</strong> on the ${ps.subscription_plan} plan, which includes ${max}.`
            : `You're using <strong>${active} of ${max}</strong> active client slots on the ${ps.subscription_plan} plan.`,
        ) + para("Archive a client you're no longer seeing to free a slot, or move to a larger plan to add more."),
      cta: { label: "Review your plan", url: `${appUrl}/settings?tab=practice&section=subscription` },
      footerNote: "You're receiving this because you manage a Clarity practice.",
      unsubscribeUrl: admin.unsubscribe_token
        ? `${appUrl}/unsubscribe?token=${admin.unsubscribe_token}&type=${EMAIL_TYPE}`
        : undefined,
      counsellorName: ps.counsellor_name ?? undefined,
    });

    const logBase = { adminId: ps.admin_id, emailType: EMAIL_TYPE, recipientEmail: admin.email, subject };
    try {
      const resendId = await sendEmail({ to: admin.email, subject, html, resendKey, fromEmail });
      await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });
      notified.push({ admin_id: ps.admin_id, active, max, over });
    } catch (err) {
      await logEmail(supabase, { ...logBase, status: "failed", errorMessage: (err as Error).message });
      notified.push({ admin_id: ps.admin_id, active, max, over, error: (err as Error).message });
    }
  }

  return new Response(JSON.stringify({ practices_checked: (settings ?? []).length, notified }), {
    headers: { "Content-Type": "application/json" },
  });
});
