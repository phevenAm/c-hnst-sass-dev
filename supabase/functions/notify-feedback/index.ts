import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detailsTable, emailTemplate, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

    const { type, message, page } = await req.json();
    if (!type || !message) {
      return new Response(JSON.stringify({ error: "Missing type or message" }), { status: 400, headers: corsHeaders });
    }

    // Submitter name (for the "From" line).
    const { data: submitter } = await supabase.from("users").select("first_name, last_name").eq("id", user.id).single();
    const fromName = [submitter?.first_name, submitter?.last_name].filter(Boolean).join(" ") || "A user";

    // Recipients: every platform owner (is_superadmin) with an auth email.
    const { data: owners } = await supabase.from("users").select("id").eq("is_superadmin", true);
    const emails = (
      await Promise.all(
        (owners ?? []).map(async (o) => {
          const { data } = await supabase.auth.admin.getUserById(o.id);
          return data?.user?.email ?? null;
        }),
      )
    ).filter((e): e is string => !!e);

    if (emails.length === 0) {
      // No superadmin to notify — the row is still saved for the in-app inbox.
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isBug = type === "bug";
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

    const html = emailTemplate({
      label: "New feedback",
      title: isBug ? "🐛 Bug report" : "💡 Feature request",
      body:
        para(escapeHtml(message).replace(/\n/g, "<br/>")) +
        detailsTable([
          { label: "Type", value: isBug ? "Bug report" : "Feature request", bold: true },
          { label: "From", value: escapeHtml(fromName) },
          { label: "Page", value: page ? escapeHtml(page) : "—" },
        ]),
      cta: appUrl ? { label: "Open superadmin", url: `${appUrl}/superadmin` } : undefined,
      footerNote: "You're receiving this because you're a Clarity platform owner.",
    });

    const resendKey = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")!;

    await Promise.all(
      emails.map((to) =>
        sendEmail({
          to,
          subject: `New ${isBug ? "bug report" : "feature request"} from ${fromName}`,
          html,
          resendKey,
          fromEmail,
        }),
      ),
    );

    return new Response(JSON.stringify({ ok: true, notified: emails.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
