-- ─────────────────────────────────────────────────────────────────────────────
-- `send-invoice-email` logs its send with email_type = 'invoice', but that
-- value was never added to email_logs_email_type_check — so every invoice
-- send since the function was written has had its email_logs insert silently
-- rejected (logEmail ignores the PostgREST error). The email still goes out;
-- it just never appears in the practice's email history.
--
-- Caught by e2e/invoicing/invoicing.spec.ts. Add 'invoice' to the allowed set.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.email_logs drop constraint if exists email_logs_email_type_check;

alter table public.email_logs
  add constraint email_logs_email_type_check check (email_type = any (array[
    'session_reminder',
    'session_booked',
    'session_cancelled',
    'session_rescheduled',
    'session_restored',
    'payment_reminder',
    'payment_confirmed',
    'questionnaire_assigned',
    'stub_invite',
    'stub_joined',
    'feedback',
    'reschedule_request',
    'client_invite',
    'account_deactivated',
    'account_reactivated',
    'account_closed',
    'agency_member_invite',
    'agency_client_assigned',
    'invoice'
  ]));

notify pgrst, 'reload schema';
