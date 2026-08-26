-- One-time flag: has this admin already been shown the "you added your first
-- client" tips modal (session-prep reminders, auto-cancel/payment deadline,
-- optional onboarding contract)? Fires the first time their client count
-- goes from 0 to 1, regardless of whether that client came from the setup
-- wizard or later normal use of the Clients page — gated purely on this flag
-- plus a live client count, not on wizard completion.
alter table public.practice_settings
  add column if not exists first_client_milestone_shown boolean not null default false;
