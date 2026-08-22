-- invite-client uses email_type = 'client_invite', which isn't in the
-- existing constraint — without this the email still sends but logEmail's
-- insert silently fails (Supabase returns an error, logEmail swallows it),
-- same gap as 20260817000005 fixed for 'stub_joined'.

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
      'client_invite'
    )
  );
