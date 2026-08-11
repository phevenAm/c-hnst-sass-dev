-- Per-client email opt-out preferences and unsubscribe token
alter table public.users
  add column if not exists email_prefs_disabled text[]  not null default '{}',
  add column if not exists unsubscribe_token    uuid    not null default gen_random_uuid();

comment on column public.users.email_prefs_disabled is
  'Email types the client has opted out of. Checked alongside practice_settings.disabled_email_types. '
  'Valid values: session_reminder, session_booked, session_cancelled, session_rescheduled, payment_reminder, questionnaire_assigned.';

comment on column public.users.unsubscribe_token is
  'Stable UUID embedded in email footer unsubscribe links. '
  'Allows one-click unsubscribe without requiring the client to be signed in.';

-- Unique index so we can look up a user by their token efficiently
create unique index if not exists users_unsubscribe_token_idx
  on public.users (unsubscribe_token);

-- Clients may read/update their own email prefs; policy is enforced via existing RLS on users table.
-- The handle-unsubscribe edge function uses the service role key and bypasses RLS intentionally.
