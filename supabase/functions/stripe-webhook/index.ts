import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import { postAgencyTeamsCard } from "../_shared/agencyTeams.ts";
import { detailsTable, emailTemplate, formatDate, logEmail, para, sendEmail } from "../_shared/email.ts";

const REFUND_EMAIL_TYPE = "refund_issued";

// Reverse-map a Stripe price ID back to our tier + billing interval so the
// app's practice_settings.subscription_plan stays in sync no matter where the
// plan changed — our Settings switcher, the Stripe billing portal, or the
// Stripe dashboard. Returns null for anything that isn't one of our 3 tiers
// (e.g. a legacy price), in which case the plan column is left untouched.
function planFromPriceId(priceId: string | null | undefined): { plan: string; interval: "month" | "year" } | null {
  if (!priceId) return null;
  const entries: [string | undefined, string, "month" | "year"][] = [
    [Deno.env.get("STRIPE_PRICE_STARTER"), "starter", "month"],
    [Deno.env.get("STRIPE_PRICE_STARTER_ANNUAL"), "starter", "year"],
    [Deno.env.get("STRIPE_PRICE_GROWTH"), "growth", "month"],
    [Deno.env.get("STRIPE_PRICE_GROWTH_ANNUAL"), "growth", "year"],
    [Deno.env.get("STRIPE_PRICE_UNLIMITED"), "unlimited", "month"],
    [Deno.env.get("STRIPE_PRICE_UNLIMITED_ANNUAL"), "unlimited", "year"],
  ];
  for (const [envPrice, plan, interval] of entries) {
    if (envPrice && envPrice === priceId) return { plan, interval };
  }
  return null;
}

// Canonicalise an email for self-referral detection: lowercase, drop any
// "+tag" suffix, and for Gmail also strip dots from the local part (Gmail
// ignores them, so alice.smith@gmail.com and alicesmith@gmail.com are one
// inbox). Not a security boundary — just closes the obvious plus-addressing
// dodge for referral farming.
function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

  // Two distinct Stripe endpoint objects point at this same URL: the
  // platform-account endpoint (subscription billing, STRIPE_WEBHOOK_SECRET)
  // and a Connect endpoint scoped to "events on connected accounts"
  // (session payments — direct charges on the counsellor's own Stripe
  // account, STRIPE_CONNECT_WEBHOOK_SECRET). Each signs with its own
  // secret, so verification tries both rather than assuming the origin.
  const candidateSecrets = [
    Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET"),
  ].filter((s): s is string => !!s);

  let event: Stripe.Event | null = null;
  let lastError: Error | null = null;
  for (const secret of candidateSecrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret);
      break;
    } catch (err: any) {
      lastError = err;
    }
  }
  if (!event) {
    return new Response(`Webhook signature verification failed: ${lastError?.message}`, { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Idempotency guard — Stripe can and does redeliver events (retries on a
  // non-2xx response, manual resends from the dashboard). A genuine
  // duplicate of an event we already finished processing short-circuits
  // here; stripe_webhook_events is only written to at the very end, after
  // processing succeeds, so a failed attempt (which never reaches that
  // insert) still gets reprocessed on Stripe's automatic retry.
  const { data: alreadyProcessed } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (alreadyProcessed) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Subscription billing events (platform account, no event.account) ──────────
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    const tier = planFromPriceId(sub.items.data[0]?.price?.id);
    await supabase
      .from("practice_settings")
      .update({
        subscription_status: sub.status,
        stripe_subscription_id: sub.id,
        subscription_cancel_at_period_end: sub.cancel_at_period_end,
        subscription_current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        // Keep the app's tier in step with Stripe wherever the change was made.
        ...(tier ? { subscription_plan: tier.plan, billing_interval: tier.interval } : {}),
      })
      .eq("billing_customer_id", sub.customer as string);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const { data: cancelledSettings } = await supabase
      .from("practice_settings")
      .update({
        subscription_status: "canceled",
        stripe_subscription_id: null,
        subscription_cancel_at_period_end: false,
        subscription_current_period_end: null,
      })
      .eq("billing_customer_id", sub.customer as string)
      .select("admin_id")
      .maybeSingle();

    // Tell the admin their subscription actually ended — previously this
    // update happened silently and the only way to notice was the app
    // locking you out next time you tried to use it.
    if (cancelledSettings?.admin_id) {
      const { data: cancelledAdmin } = await supabase
        .from("users")
        .select("email")
        .eq("id", cancelledSettings.admin_id)
        .single();

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
      const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
      const subject = "Your Clarity subscription has ended";

      await supabase.from("notifications").insert({
        user_id: cancelledSettings.admin_id,
        type: "subscription_cancelled",
        message: "Your Clarity subscription has ended. Resubscribe any time to regain access.",
      });

      if (cancelledAdmin?.email && resendKey && fromEmail) {
        const html = emailTemplate({
          label: "Subscription Ended",
          title: "Your subscription has ended",
          body:
            para("Your Clarity subscription is now cancelled and billing has stopped.") +
            para("Your account and data are still here — resubscribe any time to pick up right where you left off."),
          cta: { label: "Resubscribe", url: `${appUrl}/subscribe` },
          footerNote: "This email was sent because your Clarity subscription ended.",
        });

        try {
          const resendId = await sendEmail({ to: cancelledAdmin.email, subject, html, resendKey, fromEmail });
          await logEmail(supabase, {
            adminId: cancelledSettings.admin_id,
            emailType: "subscription_cancelled",
            recipientEmail: cancelledAdmin.email,
            subject,
            resendEmailId: resendId,
            status: "sent",
          });
        } catch (sendErr: any) {
          await logEmail(supabase, {
            adminId: cancelledSettings.admin_id,
            emailType: "subscription_cancelled",
            recipientEmail: cancelledAdmin.email,
            subject,
            status: "failed",
            errorMessage: sendErr.message,
          });
        }
      }
    }
  }

  // ── Subscription checkout completed — activate account immediately ───────────
  if (event.type === "checkout.session.completed") {
    const cs = event.data.object as Stripe.Checkout.Session;
    if (cs.mode === "subscription" && cs.metadata?.admin_id) {
      const plan = cs.metadata?.plan ?? "app";
      const billing = cs.metadata?.billing ?? "monthly";
      const referralCode = cs.metadata?.referral_code ?? null;

      // Upsert so activation works even if the DB trigger didn't create the row
      await supabase.from("practice_settings").upsert(
        {
          admin_id: cs.metadata.admin_id,
          subscription_status: "active",
          subscription_plan: plan,
          billing_period: billing,
          ...(referralCode ? { referred_by_code: referralCode } : {}),
        },
        { onConflict: "admin_id" },
      );

      // Record the referral as PENDING. The referrer is not paid here — an
      // instant refund/cancel would otherwise walk away with the credit. The
      // grant happens later, when this referred practice pays its first
      // renewal invoice (see the invoice.payment_succeeded handler below).
      if (referralCode) {
        const referredAdminId = cs.metadata.admin_id;
        const referredCustomerId = typeof cs.customer === "string" ? cs.customer : null;

        const { data: referrer } = await supabase
          .from("practice_settings")
          .select("admin_id, billing_customer_id")
          .eq("referral_code", referralCode)
          .maybeSingle();

        // Unknown code -> silently ignore, exactly as before.
        if (referrer?.admin_id) {
          // Self-referral checks. Any hit records the row as rejected (kept
          // for visibility) rather than pending.
          let rejectedReason: string | null = null;
          if (referrer.admin_id === referredAdminId) {
            rejectedReason = "self_same_account";
          } else if (referrer.billing_customer_id && referrer.billing_customer_id === referredCustomerId) {
            rejectedReason = "self_same_customer";
          } else {
            const { data: pair } = await supabase
              .from("users")
              .select("id, email")
              .in("id", [referrer.admin_id, referredAdminId]);
            const referrerEmail = pair?.find((u) => u.id === referrer.admin_id)?.email;
            const referredEmail = pair?.find((u) => u.id === referredAdminId)?.email;
            if (referrerEmail && referredEmail && normalizeEmail(referrerEmail) === normalizeEmail(referredEmail)) {
              rejectedReason = "self_same_email";
            }
          }

          // ignoreDuplicates: a re-subscribe or a Stripe redelivery must not
          // create a second row or disturb an already-granted one.
          await supabase.from("referral_credits").upsert(
            {
              referred_admin_id: referredAdminId,
              referrer_admin_id: referrer.admin_id,
              referral_code: referralCode,
              status: rejectedReason ? "rejected" : "pending",
              rejected_reason: rejectedReason,
            },
            { onConflict: "referred_admin_id", ignoreDuplicates: true },
          );
        }
      }

      // Welcome/confirmation email — the only signal a new subscriber gets
      // that the payment actually went through.
      const { data: newAdminUser } = await supabase
        .from("users")
        .select("email")
        .eq("id", cs.metadata.admin_id)
        .single();

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
      const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

      if (newAdminUser?.email && resendKey && fromEmail) {
        const planLabel =
          ({ app: "App", website: "Website", bundle: "Bundle" } as Record<string, string>)[plan] ?? plan;
        const subject = "Welcome to Clarity — your subscription is active";
        const html = emailTemplate({
          label: "Subscription Confirmed",
          title: "Welcome to Clarity!",
          body:
            para(
              `Your subscription is now active on the <strong style="color:#2d2520;">${planLabel}</strong> plan, billed ${billing}.`,
            ) + para("You're all set up — head to your dashboard to start managing your practice."),
          cta: { label: "Go to dashboard", url: `${appUrl}/admin` },
          footerNote: "This email was sent because you subscribed to Clarity.",
        });

        try {
          const resendId = await sendEmail({ to: newAdminUser.email, subject, html, resendKey, fromEmail });
          await logEmail(supabase, {
            adminId: cs.metadata.admin_id,
            emailType: "subscription_started",
            recipientEmail: newAdminUser.email,
            subject,
            resendEmailId: resendId,
            status: "sent",
          });
        } catch (sendErr: any) {
          await logEmail(supabase, {
            adminId: cs.metadata.admin_id,
            emailType: "subscription_started",
            recipientEmail: newAdminUser.email,
            subject,
            status: "failed",
            errorMessage: sendErr.message,
          });
        }
      }
    }
  }

  // ── Session payment events (from connected counsellor accounts) ───────────────
  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId = checkoutSession.payment_intent as string;
    const amountPounds = ((checkoutSession.amount_total ?? 0) / 100).toFixed(2);
    const { session_id, block_id } = checkoutSession.metadata ?? {};

    let clientId: string | null = null;
    let adminId: string | null = null;
    let sessionDescription = "a counselling session";
    let sessionDate: string | null = null;

    if (block_id) {
      const { data: blockSessions } = await supabase
        .from("sessions")
        .select("id, client_id, scheduled_at")
        .filter("metadata->>block_id", "eq", block_id);

      if (blockSessions && blockSessions.length > 0) {
        clientId = blockSessions[0].client_id;
        sessionDescription = `a block of ${blockSessions.length} sessions`;
        await supabase
          .from("sessions")
          .update({ paid: true, stripe_payment_intent_id: paymentIntentId })
          .in(
            "id",
            blockSessions.map((s: { id: string }) => s.id),
          );
      }
    } else if (session_id) {
      const { data: sess } = await supabase
        .from("sessions")
        .select("client_id, scheduled_at")
        .eq("id", session_id)
        .single();

      if (sess) {
        clientId = sess.client_id;
        sessionDate = formatDate(sess.scheduled_at);
        sessionDescription = sessionDate;
        await supabase
          .from("sessions")
          .update({ paid: true, stripe_payment_intent_id: paymentIntentId })
          .eq("id", session_id);
      }
    }

    if (clientId) {
      // Look up the client's admin — not a hardcoded first-admin query
      const { data: clientUser } = await supabase
        .from("users")
        .select("first_name, last_name, admin_id")
        .eq("id", clientId)
        .single();

      adminId = clientUser?.admin_id ?? null;
      const clientName = clientUser
        ? `${clientUser.first_name ?? ""} ${clientUser.last_name ?? ""}`.trim()
        : "A client";

      const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");

      const html = emailTemplate({
        label: "Payment Received",
        title: `${clientName} has paid`,
        body:
          para(
            `A payment of <strong style="color:#2d2520;">£${amountPounds}</strong> has been received for ${sessionDescription}.`,
          ) +
          detailsTable([
            { label: "Client", value: clientName, bold: true },
            { label: "Amount", value: `£${amountPounds}` },
            { label: "Session", value: sessionDescription },
          ]),
        cta: { label: "View client page", url: `${appUrl}/admin/clients/${clientId}` },
        footerNote: "This email was sent because a client completed a payment through Clarity.",
      });

      if (adminId) {
        const { data: adminUser } = await supabase.from("users").select("email").eq("id", adminId).single();

        await Promise.all([
          supabase.from("notifications").insert({
            user_id: adminId,
            type: "payment_received",
            message: `${clientName} paid £${amountPounds} for ${sessionDescription}`,
          }),
          postAgencyTeamsCard(supabase, adminId, {
            event: "paid",
            clientName,
            detail: `£${amountPounds} — ${sessionDescription}`,
          }),
          adminUser?.email && resendKey && fromEmail
            ? sendEmail({
                to: adminUser.email,
                subject: `Payment received — ${clientName} (£${amountPounds})`,
                html,
                resendKey,
                fromEmail,
              })
            : Promise.resolve(),
        ]);
      }
    }
  }

  // ── Refunds — the single place the client is told about a refund, since
  // this fires whether the refund was issued through Clarity's Cancel/Delete
  // flow or directly from the Stripe dashboard (which never touches
  // cancel-session at all). Guarded on paid = true so a refund cancel-session
  // already flipped to unpaid doesn't get double-processed here. Any refund
  // on the charge — full or partial — marks every session tied to it unpaid;
  // partial-refund granularity isn't tracked anywhere else in the app either.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = charge.payment_intent as string | null;

    if (paymentIntentId) {
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, client_id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .eq("paid", true);

      if (sessions && sessions.length > 0) {
        await supabase
          .from("sessions")
          .update({ paid: false })
          .in(
            "id",
            sessions.map((s: { id: string }) => s.id),
          );

        const clientId = sessions[0].client_id;
        const amountPounds = (charge.amount_refunded / 100).toFixed(2);

        const [{ data: clientProfile }, { data: authResult }] = await Promise.all([
          supabase
            .from("users")
            .select("first_name, admin_id, email_prefs_disabled, unsubscribe_token")
            .eq("id", clientId)
            .single(),
          supabase.auth.admin.getUserById(clientId),
        ]);

        await supabase.from("notifications").insert({
          user_id: clientId,
          type: "refund_issued",
          message: `You were refunded £${amountPounds}.`,
        });

        const clientEmail = authResult?.user?.email;
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
        let skipEmail = !clientEmail || (clientProfile?.email_prefs_disabled ?? []).includes(REFUND_EMAIL_TYPE);
        let counsellorName: string | undefined;

        if (!skipEmail && clientProfile?.admin_id) {
          const { data: ps } = await supabase
            .from("practice_settings")
            .select("disabled_email_types, counsellor_name")
            .eq("admin_id", clientProfile.admin_id)
            .maybeSingle();
          counsellorName = ps?.counsellor_name ?? undefined;
          if ((ps?.disabled_email_types ?? []).includes(REFUND_EMAIL_TYPE)) skipEmail = true;
        }

        if (!skipEmail && resendKey && fromEmail && clientEmail) {
          const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
          const firstName = clientProfile?.first_name ?? "there";
          const subject = `You've been refunded £${amountPounds}`;
          const unsubscribeUrl = clientProfile?.unsubscribe_token
            ? `${appUrl}/unsubscribe?token=${clientProfile.unsubscribe_token}&type=${REFUND_EMAIL_TYPE}`
            : undefined;

          const html = emailTemplate({
            label: "Refund Issued",
            title: `Hi ${firstName}, you've been refunded`,
            body:
              para("A refund has been issued for your session:") +
              detailsTable([{ label: "Amount", value: `£${amountPounds}`, bold: true }]),
            footerNote:
              "This email was sent because a refund was issued through Clarity. It may take a few days to appear on your statement.",
            unsubscribeUrl,
            counsellorName,
          });

          try {
            const resendId = await sendEmail({ to: clientEmail, subject, html, resendKey, fromEmail });
            await logEmail(supabase, {
              adminId: clientProfile?.admin_id,
              clientId,
              sessionId: sessions[0].id,
              emailType: REFUND_EMAIL_TYPE,
              recipientEmail: clientEmail,
              subject,
              resendEmailId: resendId,
              status: "sent",
            });
          } catch (sendErr: any) {
            await logEmail(supabase, {
              adminId: clientProfile?.admin_id,
              clientId,
              sessionId: sessions[0].id,
              emailType: REFUND_EMAIL_TYPE,
              recipientEmail: clientEmail,
              subject,
              status: "failed",
              errorMessage: sendErr.message,
            });
          }
        }
      }
    }
  }

  // ── Payment failed — tell the admin their card was declined. A declined
  // card otherwise fails silently: customer.subscription.updated flips the
  // status to past_due in the DB, but nothing ever tells the admin why.
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string | null;

    if (customerId) {
      const { data: settings } = await supabase
        .from("practice_settings")
        .select("admin_id")
        .eq("billing_customer_id", customerId)
        .maybeSingle();

      if (settings?.admin_id) {
        const { data: adminUser } = await supabase.from("users").select("email").eq("id", settings.admin_id).single();

        const amountPounds = ((invoice.amount_due ?? 0) / 100).toFixed(2);
        const willRetry = !!invoice.next_payment_attempt;
        const subject = "Action needed — your Clarity payment failed";

        await supabase.from("notifications").insert({
          user_id: settings.admin_id,
          type: "payment_failed",
          message: `A payment of £${amountPounds} failed. Update your payment method to avoid losing access.`,
        });

        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
        const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

        if (adminUser?.email && resendKey && fromEmail) {
          const html = emailTemplate({
            label: "Payment Failed",
            title: "We couldn't take payment for your subscription",
            body:
              para(
                `A payment of <strong style="color:#2d2520;">£${amountPounds}</strong> for your Clarity subscription didn't go through — your card may have expired or been declined.`,
              ) +
              para(
                willRetry
                  ? "Stripe will automatically retry the payment in a few days. To avoid any interruption to your account, please update your payment method now."
                  : "This was the final retry attempt. Please update your payment method now to keep your account active.",
              ),
            cta: { label: "Update payment method", url: `${appUrl}/settings` },
            footerNote: "This email was sent because a subscription payment for your Clarity account failed.",
          });

          try {
            const resendId = await sendEmail({ to: adminUser.email, subject, html, resendKey, fromEmail });
            await logEmail(supabase, {
              adminId: settings.admin_id,
              emailType: "payment_failed",
              recipientEmail: adminUser.email,
              subject,
              resendEmailId: resendId,
              status: "sent",
            });
          } catch (sendErr: any) {
            await logEmail(supabase, {
              adminId: settings.admin_id,
              emailType: "payment_failed",
              recipientEmail: adminUser.email,
              subject,
              status: "failed",
              errorMessage: sendErr.message,
            });
          }
        }
      }
    }
  }

  // ── Recurring payment succeeded — a receipt for renewal charges. Scoped to
  // billing_reason "subscription_cycle" so this doesn't double up with the
  // welcome email checkout.session.completed already sends for the first
  // payment (that one has its own invoice.payment_succeeded event too, with
  // billing_reason "subscription_create").
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string | null;

    if (customerId && invoice.billing_reason === "subscription_cycle") {
      const { data: settings } = await supabase
        .from("practice_settings")
        .select("admin_id")
        .eq("billing_customer_id", customerId)
        .maybeSingle();

      if (settings?.admin_id) {
        const { data: adminUser } = await supabase.from("users").select("email").eq("id", settings.admin_id).single();

        const amountPounds = ((invoice.amount_paid ?? 0) / 100).toFixed(2);
        const subject = `Payment receipt — £${amountPounds}`;

        const resendKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
        const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

        if (adminUser?.email && resendKey && fromEmail) {
          const html = emailTemplate({
            label: "Payment Receipt",
            title: "Your Clarity subscription renewed",
            body:
              para(
                `A payment of <strong style="color:#2d2520;">£${amountPounds}</strong> was taken for your Clarity subscription.`,
              ) +
              (invoice.hosted_invoice_url
                ? para(`<a href="${invoice.hosted_invoice_url}" style="color:#2d7264;">View invoice</a>`)
                : ""),
            cta: { label: "Manage billing", url: `${appUrl}/settings` },
            footerNote: "This email was sent because your Clarity subscription renewed.",
          });

          try {
            const resendId = await sendEmail({ to: adminUser.email, subject, html, resendKey, fromEmail });
            await logEmail(supabase, {
              adminId: settings.admin_id,
              emailType: "subscription_payment_succeeded",
              recipientEmail: adminUser.email,
              subject,
              resendEmailId: resendId,
              status: "sent",
            });
          } catch (sendErr: any) {
            await logEmail(supabase, {
              adminId: settings.admin_id,
              emailType: "subscription_payment_succeeded",
              recipientEmail: adminUser.email,
              subject,
              status: "failed",
              errorMessage: sendErr.message,
            });
          }
        }
      }
    }
  }

  // ── Referral credit — granted only once the REFERRED practice has paid a
  // full billing period (first renewal invoice). An instant refund/cancel
  // never produces a subscription_cycle invoice, so it never earns anything.
  // The credit is sized from the referrer's live Stripe price so it tracks
  // whatever plan/interval they're actually on.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string | null;

    if (customerId && invoice.billing_reason === "subscription_cycle" && (invoice.amount_paid ?? 0) > 0) {
      const { data: referredSettings } = await supabase
        .from("practice_settings")
        .select("admin_id")
        .eq("billing_customer_id", customerId)
        .maybeSingle();

      if (referredSettings?.admin_id) {
        // Atomically claim the pending row: whichever concurrent delivery wins
        // this conditional update gets the row back and does the payout; the
        // rest see nothing. Reverted to 'pending' below if the payout can't
        // complete, so a later cycle retries.
        const { data: claim } = await supabase
          .from("referral_credits")
          .update({ status: "claimed" })
          .eq("referred_admin_id", referredSettings.admin_id)
          .eq("status", "pending")
          .select("id, referrer_admin_id")
          .maybeSingle();

        if (claim) {
          const { data: referrer } = await supabase
            .from("practice_settings")
            .select("billing_customer_id, subscription_status, stripe_subscription_id")
            .eq("admin_id", claim.referrer_admin_id)
            .maybeSingle();

          const referrerActive =
            !!referrer?.billing_customer_id &&
            ["active", "trialing", "past_due"].includes(referrer.subscription_status ?? "");

          if (!referrerActive) {
            // Referrer has since churned — the offer was "credited to your
            // account", and there's no account to credit.
            await supabase
              .from("referral_credits")
              .update({ status: "rejected", rejected_reason: "referrer_not_subscribed" })
              .eq("id", claim.id);
          } else {
            // Two months of the referrer's current price, in pence.
            let monthlyPence: number | null = null;
            try {
              let sub: Stripe.Subscription | null = null;
              if (referrer!.stripe_subscription_id) {
                sub = await stripe.subscriptions.retrieve(referrer!.stripe_subscription_id);
              } else {
                const list = await stripe.subscriptions.list({
                  customer: referrer!.billing_customer_id!,
                  status: "active",
                  limit: 1,
                });
                sub = list.data[0] ?? null;
              }
              const price = sub?.items.data[0]?.price;
              if (price?.unit_amount) {
                monthlyPence =
                  price.recurring?.interval === "year" ? Math.round(price.unit_amount / 12) : price.unit_amount;
              }
            } catch (err) {
              console.error("referral: failed to load referrer price", err);
            }

            if (!monthlyPence) {
              // Couldn't price it — leave it for the next cycle rather than guess.
              await supabase.from("referral_credits").update({ status: "pending" }).eq("id", claim.id);
            } else {
              const creditPence = monthlyPence * 2;
              try {
                const txn = await stripe.customers.createBalanceTransaction(referrer!.billing_customer_id!, {
                  amount: -creditPence, // negative = credit toward future invoices
                  currency: "gbp",
                  description: "Referral credit — 2 months",
                });

                await supabase
                  .from("referral_credits")
                  .update({
                    status: "granted",
                    credit_amount_pence: creditPence,
                    stripe_balance_txn_id: txn.id,
                    granted_at: new Date().toISOString(),
                  })
                  .eq("id", claim.id);

                await supabase.from("notifications").insert({
                  user_id: claim.referrer_admin_id,
                  type: "referral_credit",
                  message: `A practice you referred stuck around — £${(creditPence / 100).toFixed(
                    2,
                  )} of referral credit is now on your account.`,
                });
              } catch (err) {
                console.error("referral: balance transaction failed, reverting to pending", err);
                await supabase.from("referral_credits").update({ status: "pending" }).eq("id", claim.id);
              }
            }
          }
        }
      }
    }
  }

  // Mark this event processed only now that every branch above has
  // completed without throwing — see the idempotency guard at the top.
  await supabase.from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
