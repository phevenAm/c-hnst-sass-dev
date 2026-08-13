-- Add send_reminders flag to sessions so the admin can opt out of automatic
-- reminder emails per session. Defaults to true so existing sessions are unaffected.
alter table public.sessions
  add column if not exists send_reminders boolean not null default true;
