-- ─────────────────────────────────────────────────────────────────────────────
-- is_within_availability (todo 6aa5cfcb)
--
-- Returns true when a proposed session start time falls inside a window that
-- the admin has explicitly opened in availability_rules or
-- availability_overrides. Returns false when:
--   • a blocking override exists for that day (whole day or covering the slot)
--   • no recurring rule covers the slot AND no open override covers it
--
-- Time comparison uses the raw UTC value stored in availability_rules.
-- If timezone support is needed in the future, add a timezone column to
-- practice_settings and convert p_scheduled_at before comparing.
--
-- Usage:
--   SELECT is_within_availability(admin_id, '2026-08-20 14:00:00+00', 50);
--   -- returns true/false
--
-- The frontend client calendar should call this (or filter using the rules
-- tables directly) so that only available slots are shown as selectable.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_within_availability(
  p_admin_id         uuid,
  p_scheduled_at     timestamptz,
  p_duration_minutes int default 50
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_date           date;
  v_start_time     time;
  v_end_time       time;
  v_dow            smallint;      -- 0 = Sunday … 6 = Saturday
  v_override_row   record;
begin
  v_date       := p_scheduled_at::date;
  v_start_time := p_scheduled_at::time;
  v_end_time   := (p_scheduled_at + (p_duration_minutes * interval '1 minute'))::time;
  v_dow        := extract(dow from p_scheduled_at)::smallint;

  -- ── 1. Check for a blocking override on this date ─────────────────────────
  -- A whole-day block (start_time/end_time is null) blocks everything.
  -- A timed block blocks only overlapping windows.
  if exists (
    select 1
    from public.availability_overrides ao
    where ao.admin_id     = p_admin_id
      and ao.override_date = v_date
      and ao.is_blocked   = true
      and (
        ao.start_time is null                         -- whole-day block
        or (ao.start_time <= v_start_time and ao.end_time >= v_end_time)  -- timed block covers slot
      )
  ) then
    return false;
  end if;

  -- ── 2. Check for a non-blocking override (explicit open window) ───────────
  if exists (
    select 1
    from public.availability_overrides ao
    where ao.admin_id      = p_admin_id
      and ao.override_date  = v_date
      and ao.is_blocked     = false
      and ao.start_time    <= v_start_time
      and ao.end_time      >= v_end_time
  ) then
    return true;
  end if;

  -- ── 3. Fall back to recurring rules for this day of week ─────────────────
  if exists (
    select 1
    from public.availability_rules ar
    where ar.admin_id    = p_admin_id
      and ar.day_of_week = v_dow
      and ar.start_time <= v_start_time
      and ar.end_time   >= v_end_time
  ) then
    return true;
  end if;

  return false;
end;
$func$;

-- Grant execute to the authenticated role so clients can call it via RPC
grant execute on function public.is_within_availability(uuid, timestamptz, int)
  to authenticated;

-- ── Convenience: get all available slots for a given date ────────────────────
-- Returns start_time + end_time pairs the admin has open on p_date,
-- taking overrides into account. Frontend can use this to render the picker.
create or replace function public.get_availability_for_date(
  p_admin_id uuid,
  p_date     date
)
returns table(start_time time, end_time time, source text)
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_dow smallint;
begin
  v_dow := extract(dow from p_date::timestamptz)::smallint;

  -- Whole-day block → return empty set
  if exists (
    select 1 from public.availability_overrides ao
    where ao.admin_id     = p_admin_id
      and ao.override_date = p_date
      and ao.is_blocked   = true
      and ao.start_time   is null
  ) then
    return;
  end if;

  -- Open overrides for this date take precedence over recurring rules
  if exists (
    select 1 from public.availability_overrides ao
    where ao.admin_id      = p_admin_id
      and ao.override_date  = p_date
      and ao.is_blocked     = false
  ) then
    return query
      select ao.start_time, ao.end_time, 'override'::text
      from public.availability_overrides ao
      where ao.admin_id      = p_admin_id
        and ao.override_date  = p_date
        and ao.is_blocked     = false;
    return;
  end if;

  -- Otherwise return recurring rules for this day, excluding timed blocks
  return query
    select ar.start_time, ar.end_time, 'rule'::text
    from public.availability_rules ar
    where ar.admin_id    = p_admin_id
      and ar.day_of_week = v_dow
      and not exists (
        select 1 from public.availability_overrides ao2
        where ao2.admin_id      = p_admin_id
          and ao2.override_date  = p_date
          and ao2.is_blocked     = true
          and ao2.start_time    <= ar.start_time
          and ao2.end_time      >= ar.end_time
      );
end;
$func$;

grant execute on function public.get_availability_for_date(uuid, date)
  to authenticated;
