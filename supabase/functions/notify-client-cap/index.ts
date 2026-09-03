import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

// Daily nudge: email + in-app notification for an admin who is within one
// client of their plan's active-client cap, or over it. Invoked by pg_cron
// (trigger_client_cap_warnings) with an x-internal-secret header. Deduped per
// admin on a 14-day cooldown via email_logs, skippable via
// users.email_prefs_disabled. Deploy with --no-verify-jwt (cron sends no JWT).

const EMAIL_TYPE = "client_cap_warning";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_CLIENT_CAP_SECRET") ?? "";
const COOLDOWN_DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });

  const gotSecret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || gotSecret !== INTERNAL_SECRET) {
    console.log(
      `notify-client-cap: 401 — secret ${!INTERNAL_SECRET ? "env var missing" : gotSecret ? "mismatch" : "not sent"}`,
    );
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
  const skipped: unknown[] = [];

  for (const ps of settings ?? []) {
    const max = maxByPlan.get(ps.subscription_plan);
    if (max == null) {
      skipped.push({
        admin_id: ps.admin_id,
        plan: ps.subscription_plan,
        reason: "unlimited / plan not in plan_limits",
      });
      continue;
    }

    // active_client_count = real clients (incl. paused, excl. archived/deleted)
    // + non-linked, non-archived offline stubs.
    const { data: active, error: cntErr } = await supabase.rpc("active_client_count", { p_admin: ps.admin_id });
    if (typeof active !== "number" || active < max - 1) {
      skipped.push({ admin_id: ps.admin_id, plan: ps.subscription_plan, max, active, cntErr: cntErr?.message ?? null });
      continue;
    }

    // email is on auth.users; prefs + unsubscribe token are on public.users
    const { data: adminRow } = await supabase
      .from("users")
      .select("email_prefs_disabled, unsubscribe_token")
      .eq("id", ps.admin_id)
      .single();
    const { data: adminAuth } = await supabase.auth.admin.getUserById(ps.admin_id);
    const adminEmail = adminAuth?.user?.email;
    if ((adminRow?.email_prefs_disabled ?? []).includes(EMAIL_TYPE)) {
      skipped.push({ admin_id: ps.admin_id, reason: "opted out" });
      continue;
    }

    const { data: recent } = await supabase
      .from("email_logs")
      .select("id")
      .eq("admin_id", ps.admin_id)
      .eq("email_type", EMAIL_TYPE)
      .eq("status", "sent")
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) {
      skipped.push({ admin_id: ps.admin_id, reason: "within 14-day cooldown" });
      continue;
    }

    const over = active > max;
    const subject = over
      ? `You're over your ${ps.subscription_plan} plan's client limit`
      : `You're using ${active} of ${max} client slots`;
    const settingsUrl = `${appUrl}/settings?tab=practice&section=subscription`;

    // In-app notification — mirrors the email so it shows in the bell too.
    await supabase.from("notifications").insert({
      user_id: ps.admin_id,
      type: EMAIL_TYPE,
      message: over
        ? `You have ${active} active clients on the ${ps.subscription_plan} plan (${max} included). Archive a client or upgrade.`
        : `You're using ${active} of ${max} client slots on the ${ps.subscription_plan} plan.`,
      url: settingsUrl,
    });

    const html = emailTemplate({
      label: "Subscription",
      title: over ? "You're over your plan's client limit" : "You're almost at your client limit",
      body:
        para(
          over
            ? `You now have <strong>${active} active clients</strong> on the ${ps.subscription_plan} plan, which includes ${max}.`
            : `You're using <strong>${active} of ${max}</strong> active client slots on the ${ps.subscription_plan} plan.`,
        ) + para("Archive a client you're no longer seeing to free a slot, or move to a larger plan to add more."),
      cta: { label: "Review your plan", url: settingsUrl },
      footerNote: "You're receiving this because you manage a Clarity practice.",
      unsubscribeUrl: adminRow?.unsubscribe_token
        ? `${appUrl}/unsubscribe?token=${adminRow.unsubscribe_token}&type=${EMAIL_TYPE}`
        : undefined,
      counsellorName: ps.counsellor_name ?? undefined,
    });

    const logBase = { adminId: ps.admin_id, emailType: EMAIL_TYPE, recipientEmail: adminEmail ?? "", subject };
    if (!adminEmail) {
      skipped.push({ admin_id: ps.admin_id, reason: "no auth email (in-app notification still sent)" });
      continue;
    }
    try {
      const resendId = await sendEmail({ to: adminEmail, subject, html, resendKey, fromEmail });
      await logEmail(supabase, { ...logBase, resendEmailId: resendId, status: "sent" });
      notified.push({ admin_id: ps.admin_id, active, max, over });
    } catch (err) {
      await logEmail(supabase, { ...logBase, status: "failed", errorMessage: (err as Error).message });
      notified.push({ admin_id: ps.admin_id, active, max, over, error: (err as Error).message });
    }
  }

  const result = { practices_checked: (settings ?? []).length, notified, skipped };
  console.log(`notify-client-cap: ${JSON.stringify(result)}`);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
