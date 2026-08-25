-- Two more gaps from the Stripe audit: admins get no email when their
-- subscription actually ends (customer.subscription.deleted just updated
-- practice_settings silently) and no receipt when a renewal charge succeeds
-- (only the very first payment gets a welcome email). New email types for
-- both, added alongside the stripe-webhook handlers.
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
      'practice_resumed',
      'subscription_payment_succeeded',
      'subscription_cancelled'
    )
  );
