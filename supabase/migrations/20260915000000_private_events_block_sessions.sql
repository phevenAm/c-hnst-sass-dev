-- ─────────────────────────────────────────────────────────────────────────────
-- A session can be booked or rescheduled straight onto a private event
--
-- practice_slot_has_conflict() (the public RPC the admin CreateSessionModal
-- calls for pre-submit feedback) and _practice_slot_has_conflict_all() (the
-- SECURITY DEFINER predicate the sessions/stub_sessions triggers actually
-- enforce) both compare a candidate slot against public.sessions and
-- public.stub_sessions — never against public.admin_private_events. So
-- supervision blocks and other private events never showed as busy, and
-- nothing stopped a session landing right on top of one, client- or
-- admin-booked.
--
-- Fix: add the same overlap clause used for stub_sessions, keyed on
-- admin_private_events.admin_id, to both predicates. admin_private_events has
-- no status/cancelled column — every row blocks its slot until deleted, so no
-- extra filter is needed there.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Public RPC (instant frontend pre-check) ─────────────────────────────────
create or replace function public.practice_slot_has_conflict(
  p_admin_id                uuid,
  p_start                   timestamptz,
  p_duration_minutes        int,
  p_exclude_session_id      uuid default null,
  p_exclude_stub_session_id uuid default null
)
returns boolean
language sql
stable
as $func$
  select
    exists (
      select 1
      from public.sessions s
      where s.created_by = p_admin_id
        and s.id is distinct from p_exclude_session_id
        and s.status <> 'cancelled'
        and tstzrange(
              s.scheduled_at,
              s.scheduled_at + (coalesce(s.duration_minutes, 50) * interval '1 minute'),
              '[)'
            ) && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    )
    or exists (
      select 1
      from public.stub_sessions ss
      where ss.admin_id = p_admin_id
        and ss.id is distinct from p_exclude_stub_session_id
        and ss.status = 'scheduled'
        and tstzrange(
              ss.scheduled_at,
              ss.scheduled_at + (coalesce(ss.duration_minutes, 50) * interval '1 minute'),
              '[)'
            ) && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    )
    or exists (
      select 1
      from public.admin_private_events pe
      where pe.admin_id = p_admin_id
        and tstzrange(pe.starts_at, pe.ends_at, '[)')
            && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    );
$func$;

-- ── Internal predicate (what the triggers actually enforce) ─────────────────
create or replace function public._practice_slot_has_conflict_all(
  p_admin_id                uuid,
  p_start                   timestamptz,
  p_duration_minutes        int,
  p_exclude_session_id      uuid default null,
  p_exclude_stub_session_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select
    exists (
      select 1
      from public.sessions s
      left join public.users cu on cu.id = s.client_id
      where (cu.admin_id = p_admin_id or s.created_by = p_admin_id)
        and s.id is distinct from p_exclude_session_id
        and s.status <> 'cancelled'
        and tstzrange(
              s.scheduled_at,
              s.scheduled_at + (coalesce(s.duration_minutes, 50) * interval '1 minute'),
              '[)'
            ) && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    )
    or exists (
      select 1
      from public.stub_sessions ss
      where ss.admin_id = p_admin_id
        and ss.id is distinct from p_exclude_stub_session_id
        and ss.status = 'scheduled'
        and tstzrange(
              ss.scheduled_at,
              ss.scheduled_at + (coalesce(ss.duration_minutes, 50) * interval '1 minute'),
              '[)'
            ) && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    )
    or exists (
      select 1
      from public.admin_private_events pe
      where pe.admin_id = p_admin_id
        and tstzrange(pe.starts_at, pe.ends_at, '[)')
            && tstzrange(
              p_start,
              p_start + (coalesce(p_duration_minutes, 50) * interval '1 minute'),
              '[)'
            )
    );
$func$;

-- Triggers prevent_session_double_booking / prevent_stub_session_double_booking
-- pick up the new _practice_slot_has_conflict_all body automatically.

-- ── Client reschedule picker: private events now show as busy too ──────────
-- Otherwise a client could pick a slot the DB trigger above then rejects.
create or replace function public.get_practice_busy_slots(exclude_session_id uuid default null)
returns table (slot_start timestamptz, slot_end timestamptz)
security definer
set search_path = public
language sql
as $func$
  with me as (
    select admin_id from public.users where id = auth.uid()
  )
  select
    s.scheduled_at as slot_start,
    s.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 50)) as slot_end
  from public.sessions s
  left join public.users cu on cu.id = s.client_id
  where (cu.admin_id = (select admin_id from me) or s.created_by = (select admin_id from me))
    and s.status <> 'cancelled'
    and (exclude_session_id is null or s.id <> exclude_session_id)

  union all

  select
    ss.scheduled_at as slot_start,
    ss.scheduled_at + make_interval(mins => coalesce(ss.duration_minutes, 50)) as slot_end
  from public.stub_sessions ss
  where ss.admin_id = (select admin_id from me)
    and ss.status = 'scheduled'

  union all

  select
    pe.starts_at as slot_start,
    pe.ends_at as slot_end
  from public.admin_private_events pe
  where pe.admin_id = (select admin_id from me)
$func$;

grant execute on function public.get_practice_busy_slots(uuid) to authenticated;

notify pgrst, 'reload schema';
