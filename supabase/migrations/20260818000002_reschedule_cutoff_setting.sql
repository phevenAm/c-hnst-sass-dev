-- The client-facing "cannot reschedule/cancel/pay within X hours of the
-- appointment" restriction was hardcoded to 48 everywhere on the frontend
-- (useSessionCard.tsx). This makes it a per-practice setting: a number of
-- hours, or NULL to disable the restriction entirely.
--
-- Default of 48 preserves current behaviour for every existing practice.

alter table public.practice_settings
  add column if not exists reschedule_cutoff_hours integer default 48;

comment on column public.practice_settings.reschedule_cutoff_hours is
  'Hours before a session start that clients are blocked from paying, rescheduling, or cancelling it themselves. NULL disables the restriction.';

-- Clients can't SELECT practice_settings directly (RLS only allows the
-- owning admin — see 20260810000004_practice_settings_rls.sql), and the
-- row also holds bank details and other PII, so we don't want to widen
-- that policy. Instead expose just this one column via a security-definer
-- RPC scoped to the caller's own admin, same pattern as
-- get_my_admin_consent_settings (20260813000007_client_consent.sql).
create or replace function public.get_my_reschedule_cutoff_hours()
returns integer
language sql
security definer
stable
set search_path = public
as $func$
  select ps.reschedule_cutoff_hours
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  where u.id = auth.uid()
  limit 1;
$func$;

grant execute on function public.get_my_reschedule_cutoff_hours() to authenticated;
