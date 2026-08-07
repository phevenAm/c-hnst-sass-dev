alter table public.practice_settings
  add column if not exists disabled_email_types text[] not null default '{}',
  add column if not exists payment_deadline_hours integer not null default 48,
  add column if not exists reminder_email_heading text;

comment on column public.practice_settings.disabled_email_types is
  'Email type IDs to suppress sending. Valid values: session_booked, session_cancelled, session_rescheduled, questionnaire_assigned, session_reminder.';
comment on column public.practice_settings.payment_deadline_hours is
  'Hours after booking before an unpaid session is flagged/auto-cancelled. Default 48 (2 days). Used in reminder copy and future auto-cancel cron.';
comment on column public.practice_settings.reminder_email_heading is
  'Custom h2 greeting line for reminder emails. Supports {{name}}. Null = "Hi {{name}},"';
