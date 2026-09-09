-- Support for the new-message email (notify-new-message edge function).
--
-- 1. conversations.last_notified_at — per-thread cooldown stamp. The function
--    only emails the client when they've been away (users.last_seen_at old)
--    AND this is null or older than the cooldown window, so a burst of
--    messages doesn't become a burst of emails. Dropped automatically with the
--    conversation row (no cleanup path needed).
--
-- 2. 'new_message' added to email_logs' allowed type list — otherwise logEmail
--    silently drops the row and the send never shows in the practice's email
--    history (same gap that bit 'invoice', 'stub_joined', 'client_invite'…).

alter table public.conversations
  add column if not exists last_notified_at timestamptz;

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
    'invoice',
    'new_message'
  ]));

notify pgrst, 'reload schema';
