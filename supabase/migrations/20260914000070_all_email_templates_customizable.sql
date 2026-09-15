-- Only the session-reminder email had customizable subject/body/heading
-- (reminder_email_subject/body/heading, from an earlier migration). The
-- other 4 client-facing email types (session booked/cancelled/rescheduled,
-- payment confirmed) were entirely hardcoded in their edge functions —
-- Settings → Emails could only enable/disable them, not edit content.
-- Mirrors the exact reminder_email_* naming/shape for each template.
alter table public.practice_settings
  add column if not exists session_booked_email_subject text,
  add column if not exists session_booked_email_body text,
  add column if not exists session_booked_email_heading text,
  add column if not exists session_cancelled_email_subject text,
  add column if not exists session_cancelled_email_body text,
  add column if not exists session_cancelled_email_heading text,
  add column if not exists session_rescheduled_email_subject text,
  add column if not exists session_rescheduled_email_body text,
  add column if not exists session_rescheduled_email_heading text,
  add column if not exists payment_confirmed_email_subject text,
  add column if not exists payment_confirmed_email_body text,
  add column if not exists payment_confirmed_email_heading text;

notify pgrst, 'reload schema';
