import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe";
import { detailsTable, emailTemplate, formatDate, para, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature) return new Response("Missing stripe-signature header", { status: 400 });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Subscription billing events (platform account, no event.account) ──────────
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    await supabase
      .from("practice_settings")
      .update({ subscription_status: sub.status, stripe_subscription_id: sub.id })
      .eq("billing_customer_id", sub.customer as string);
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await supabase
      .from("practice_settings")
      .update({ subscription_status: "canceled", stripe_subscription_id: null })
      .eq("billing_customer_id", sub.customer as string);
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

      // Apply 2-month balance credit to the referrer
      if (referralCode) {
        const { data: referrer } = await supabase
          .from("practice_settings")
          .select("billing_customer_id, subscription_plan")
          .eq("referral_code", referralCode)
          .single();

        if (referrer?.billing_customer_id) {
          const planPrices: Record<string, number> = { app: 20, website: 15, bundle: 29 };
          const monthlyPrice = planPrices[referrer.subscription_plan ?? "app"] ?? 20;
          const creditPence = monthlyPrice * 2 * 100; // 2 months in pence

          await stripe.customers.createBalanceTransaction(referrer.billing_customer_id, {
            amount: -creditPence, // negative = credit
            currency: "gbp",
            description: "Referral credit — 2 months",
          });
        }
      }

      return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
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
            `A payment of <strong style="color:#2d2926;">£${amountPounds}</strong> has been received for ${sessionDescription}.`,
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

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
