-- ─────────────────────────────────────────────────────────────────────────────
-- Double-booking guard across BOTH real sessions and offline-client sessions
--
-- Until now the overlap trigger (20260817000000_no_double_booking.sql) only
-- compared public.sessions against other public.sessions, and public.stub_sessions
-- had no overlap guard at all. So an offline (stub) client's booking never
-- blocked a real client's slot, stub-vs-stub never clashed, and the client
-- reschedule picker (get_practice_busy_slots) offered slots offline clients held.
--
-- This migration adds one shared predicate used by triggers on both tables and
-- by the reschedule picker. Only stub sessions with status = 'scheduled' count
-- as conflicts — back-dated 'attended' / 'no_show' history logs are ignored.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Shared predicate ────────────────────────────────────────────────────────
-- True when [p_start, p_start + p_duration_minutes) overlaps a live booking for
-- this practice: any non-cancelled real session, or any scheduled stub session.
-- The optional exclude args drop the row currently being inserted/updated.
--
-- language sql + invoker rights on purpose: RLS ("admins manage own sessions" /
-- "admins manage own stub sessions") already scopes every caller to their own
-- practice, so passing another practice's admin_id sees nothing. SECURITY DEFINER
-- would turn this into a cross-practice free/busy oracle — don't.
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
    );
$func$;

grant execute on function public.practice_slot_has_conflict(uuid, timestamptz, int, uuid, uuid)
  to authenticated;

-- ── Real-session trigger: now also blocks against stub sessions ─────────────
create or replace function public.check_session_overlap()
returns trigger
language plpgsql
as $func$
begin
  -- Cancelled sessions don't block slots
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Only enforce when we know who created the session
  if new.created_by is null then
    return new;
  end if;

  if public.practice_slot_has_conflict(
       new.created_by,
       new.scheduled_at,
       coalesce(new.duration_minutes, 50),
       new.id,
       null
     ) then
    raise exception 'This time overlaps with another session (including offline-client sessions) for this practice';
  end if;

  return new;
end;
$func$;

-- Trigger prevent_session_double_booking is already attached from
-- 20260817000000_no_double_booking.sql and picks up the new function body.

-- ── Stub-session trigger: brand new ────────────────────────────────────────
-- Only guards genuine future bookings (status = 'scheduled'); back-dated
-- attended / no_show logs and cancellations never raise a conflict.
create or replace function public.check_stub_session_overlap()
returns trigger
language plpgsql
as $func$
begin
  if new.status <> 'scheduled' then
    return new;
  end if;

  if public.practice_slot_has_conflict(
       new.admin_id,
       new.scheduled_at,
       coalesce(new.duration_minutes, 50),
       null,
       new.id
     ) then
    raise exception 'This time overlaps with another session for this practice';
  end if;

  return new;
end;
$func$;

drop trigger if exists prevent_stub_session_double_booking on public.stub_sessions;

create trigger prevent_stub_session_double_booking
  before insert or update on public.stub_sessions
  for each row execute function public.check_stub_session_overlap();

-- ── Client reschedule picker: include offline-client slots as busy ─────────
-- Mirrors 20260805000004_practice_busy_slots.sql, plus scheduled stub sessions
-- for the same practice admin. Still SECURITY DEFINER — returns only timestamps.
create or replace function public.get_practice_busy_slots(exclude_session_id uuid default null)
returns table (slot_start timestamptz, slot_end timestamptz)
security definer
set search_path = public
language sql as $func$
  select
    s.scheduled_at as slot_start,
    s.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 50)) as slot_end
  from sessions s
  where s.created_by = (select admin_id from users where id = auth.uid())
    and s.status != 'cancelled'
    and (exclude_session_id is null or s.id != exclude_session_id)

  union all

  select
    ss.scheduled_at as slot_start,
    ss.scheduled_at + make_interval(mins => coalesce(ss.duration_minutes, 50)) as slot_end
  from stub_sessions ss
  where ss.admin_id = (select admin_id from users where id = auth.uid())
    and ss.status = 'scheduled'
$func$;

grant execute on function public.get_practice_busy_slots(uuid) to authenticated;
