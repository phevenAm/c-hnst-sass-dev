-- Stripe readiness hardening (audit 2026-08-25):
--
-- 1. Webhook idempotency. Stripe explicitly can and does redeliver events
--    (retries on a non-2xx response, manual resends from the dashboard).
--    Without a dedup guard, a redelivered checkout.session.completed
--    double-credits the referrer's Stripe balance, and a redelivered
--    charge.refunded double-emails a client about a refund they already
--    know about. stripe-webhook/index.ts now checks this table before
--    reprocessing an event.id and records it only after the event's
--    processing completes successfully — so a genuine failure (which never
--    reaches the insert) still gets retried by Stripe, but a true duplicate
--    of an already-completed event short-circuits immediately.
create table public.stripe_webhook_events (
  event_id    text        primary key,
  event_type  text        not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No policies: this is bookkeeping for the stripe-webhook edge function
-- only, which uses the service role key and therefore bypasses RLS. No
-- anon/authenticated caller has any reason to read or write it.

comment on table public.stripe_webhook_events is
  'Dedup ledger for stripe-webhook — one row per successfully-processed Stripe event.id, guards against Stripe redelivering the same event.';

-- 2. New email types for the payment-failure and welcome emails added
--    alongside this migration.
alter table public.email_logs
  drop constraint if exists email_logs_email_type_check;

alter table public.email_logs
  add constraint email_logs_email_type_check check (
    email_type in (
      'session_reminder',
      'session_booked',
      'session_cancelled',
      'session_rescheduled',
      'payment_reminder',
      'payment_confirmed',
      'questionnaire_assigned',
      'stub_invite',
      'stub_joined',
      'feedback',
      'reschedule_request',
      'client_invite',
      'payment_failed',
      'subscription_started',
      'practice_paused',
      'practice_resumed'
    )
  );
