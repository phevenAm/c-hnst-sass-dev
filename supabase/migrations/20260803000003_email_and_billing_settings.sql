alter table public.practice_settings
  add column if not exists billing_period text not null default 'monthly',
  add column if not exists reminder_hours_before integer not null default 120,
  add column if not exists reminder_email_subject text,
  add column if not exists reminder_email_body text;

comment on column public.practice_settings.billing_period is 'monthly or annual';
comment on column public.practice_settings.reminder_hours_before is 'How many hours before a session to send the reminder email. Default 120 = 5 days.';
comment on column public.practice_settings.reminder_email_subject is 'Custom reminder subject. Supports {{date}}. Null = use default.';
comment on column public.practice_settings.reminder_email_body is 'Custom reminder body text. Supports {{name}}, {{date}}, {{location}}, {{duration}}. Null = use default.';
