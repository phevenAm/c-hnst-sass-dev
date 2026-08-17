-- notify-admin-stub-joined uses email_type = 'stub_joined' but this value
-- is not in the email_logs_email_type_check constraint. The log insert silently
-- fails (Supabase returns {data:null, error:{...}} and logEmail ignores it),
-- so the email IS sent but never recorded. Add the missing type.

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
      'reschedule_request'
    )
  );
