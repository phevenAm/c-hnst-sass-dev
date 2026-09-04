import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import { emailTemplate, logEmail, para, sendEmail } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// Admin self-serve version of superadmin-set-practice-paused: an admin pauses
// (or resumes) their OWN practice. Pausing is the sanctioned way to step away
// long-term without losing anything — deleting the account is permanent and
// takes the data with it (see delete_own_account + docs/legal/terms-of-service.md).
//
// Pausing makes the whole practice read-only in-app (block_paused_write
// trigger, 20260826000000_practice_pause.sql) — the admin can still sign in,
// read, and export; their clients can't sign in at all — and pauses Stripe
// billing (pause_collection behavior:"void") so we're not charging for a
// frozen account. The two always move together. Resuming clears both.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Only a practice owner can pause their practice. Agency members / clients
    // must not be able to freeze an account out from under the owner.
    const { data: profile } = await supabase.from("users").select("role, admin_id").eq("id", user.id).single();
    if (profile?.role !== "admin" || profile?.admin_id) {
      return new Response(JSON.stringify({ error: "Forbidden — only the practice owner can pause the practice" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const paused: unknown = body?.paused;
    const reason: string | null = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    if (typeof paused !== "boolean") {
      return new Response(JSON.stringify({ error: "paused (boolean) is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("practice_settings")
      .select("is_paused, stripe_subscription_id")
      .eq("admin_id", user.id)
      .single();
    if (settingsError) throw new Error(settingsError.message);

    // Idempotent: calling pause on an already-paused practice (or resume on a
    // live one) is a no-op success, not an error.
    if (settings?.is_paused === paused) {
      return new Response(JSON.stringify({ success: true, unchanged: true, stripeErrors: [] }), {
        headers: corsHeaders,
      });
    }

    const stripeErrors: string[] = [];
    if (settings?.stripe_subscription_id) {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
      try {
        await stripe.subscriptions.update(settings.stripe_subscription_id, {
          pause_collection: paused ? { behavior: "void" } : null,
        });
      } catch (err: any) {
        // A Stripe hiccup shouldn't block the in-app lock — report it back so
        // the admin knows billing wasn't touched and can check Stripe.
        stripeErrors.push(err.message);
      }
    }

    const { error: updateError } = await supabase
      .from("practice_settings")
      .update({
        is_paused: paused,
        paused_at: paused ? new Date().toISOString() : null,
        paused_reason: paused ? reason : null,
      })
      .eq("admin_id", user.id);
    if (updateError) throw new Error(updateError.message);

    // Confirmation email — gives the admin a dated record of the change and a
    // reminder of what pausing does / doesn't do.
    const { data: adminUser } = await supabase.from("users").select("email").eq("id", user.id).single();
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    const emailType = paused ? "practice_paused" : "practice_resumed";
    const subject = paused ? "You paused your Clarity practice" : "Your Clarity practice is active again";

    if (adminUser?.email && resendKey && fromEmail) {
      const html = emailTemplate({
        label: paused ? "Practice Paused" : "Practice Reactivated",
        title: paused ? "Your practice is paused" : "Your practice is active again",
        body: paused
          ? para(
              "You've paused your Clarity practice. You can still sign in to read and export your records, but nothing can be created or changed, and your clients can't sign in, until you resume.",
            ) +
            para("Billing is paused for as long as your practice stays paused — you won't be charged.") +
            para("Nothing is deleted. Resume any time from Settings &rarr; Subscription.")
          : para(
              "Your Clarity practice is active again. You and your clients can use the app normally, and billing has resumed on your usual cycle.",
            ),
        footerNote: "You're receiving this because you changed your practice's pause status.",
      });

      try {
        const resendId = await sendEmail({ to: adminUser.email, subject, html, resendKey, fromEmail });
        await logEmail(supabase, {
          adminId: user.id,
          emailType,
          recipientEmail: adminUser.email,
          subject,
          resendEmailId: resendId,
          status: "sent",
        });
      } catch (sendErr: any) {
        await logEmail(supabase, {
          adminId: user.id,
          emailType,
          recipientEmail: adminUser.email,
          subject,
          status: "failed",
          errorMessage: sendErr.message,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, paused, stripeErrors }), { headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
