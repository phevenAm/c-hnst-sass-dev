-- Agencies: allow the new transactional-email types in email_logs.
-- email_logs.email_type is a hard whitelist (see the account-status migration);
-- logEmail() inserts are swallowed on violation, so any new type must be added
-- here or its send is never logged.

alter table public.email_logs drop constraint if exists email_logs_email_type_check;

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
      'account_deactivated',
      'account_reactivated',
      'account_closed',
      'agency_member_invite',
      'agency_client_assigned'
    )
  );
