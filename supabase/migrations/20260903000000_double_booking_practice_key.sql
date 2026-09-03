-- ─────────────────────────────────────────────────────────────────────────────
-- Double-booking guard: key on the PRACTICE, not on sessions.created_by
--
-- 20260830000000_double_booking_across_offline_clients.sql compared real
-- sessions with `s.created_by = p_admin_id` and the real-session trigger bailed
-- out entirely when `new.created_by IS NULL`. `created_by` is just whoever hit
-- "create" — fine while that is always the one practice admin, but the check is
-- silently skipped or scoped to the wrong person when:
--
--   * the booking is made by the client (client reschedule / self-book): the
--     trigger passed the client's uid, so an admin-made or offline-client
--     session at the same slot matched nothing  ->  double booking.
--   * created_by IS NULL (stub-merge imports — see the "Doggy bag" rows on prod
--     with client_id 11bb4dd1-…, plus legacy CSV imports): check_session_overlap
--     returned early and never looked.
--   * an agency sub-admin books for a manager's client (created_by = sub-admin,
--     other sessions created by the manager).
--
-- Fix: resolve the practice from the client (users.admin_id), fall back to
-- created_by, and compare against EVERY live booking for that practice through
-- a SECURITY DEFINER internal predicate, so the guard is complete regardless of
-- which role runs the write or what RLS would let that role see.
--
-- The public, granted `practice_slot_has_conflict()` RPC (used by the admin
-- CreateSessionModal for instant pre-submit feedback) is left exactly as-is:
-- making it SECURITY DEFINER would turn it into a cross-practice free/busy
-- oracle for any authenticated user. The trigger path below is not callable
-- directly, so it can safely run definer-rights.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Internal predicate: practice-wide, RLS-independent ──────────────────────
-- NOT granted to anyone — only the two BEFORE-row triggers below call it.
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
    );
$func$;

revoke all on function public._practice_slot_has_conflict_all(uuid, timestamptz, int, uuid, uuid)
  from public, anon, authenticated;

-- ── Real-session trigger ───────────────────────────────────────────────────
-- Now SECURITY DEFINER: the overlap SELECT must see the whole practice's
-- calendar, not just the rows the writing role's RLS exposes.
create or replace function public.check_session_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_practice_admin uuid;
begin
  -- Cancelled sessions don't hold a slot.
  if new.status = 'cancelled' then
    return new;
  end if;

  -- The practice is the client's owning admin; created_by is only a fallback
  -- for rows whose client has no admin_id yet.
  select u.admin_id into v_practice_admin
  from public.users u
  where u.id = new.client_id;

  v_practice_admin := coalesce(v_practice_admin, new.created_by);

  -- Genuinely can't place this row in a practice — let it through rather than
  -- block on incomplete data.
  if v_practice_admin is null then
    return new;
  end if;

  if public._practice_slot_has_conflict_all(
       v_practice_admin,
       new.scheduled_at,
       coalesce(new.duration_minutes, 50),
       new.id,
       null
     ) then
    raise exception
      'This time overlaps with another session (including offline-client sessions) for this practice';
  end if;

  return new;
end;
$func$;

-- Trigger prevent_session_double_booking (from 20260817000000) picks up the
-- new body automatically.

-- ── Stub-session trigger ───────────────────────────────────────────────────
-- admin_id is already the practice; switch to the practice-wide predicate so a
-- stub booking also clashes with client-booked real sessions.
create or replace function public.check_stub_session_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.status <> 'scheduled' then
    return new;
  end if;

  if public._practice_slot_has_conflict_all(
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

-- ── Client reschedule picker: same practice-key correction ──────────────────
-- Mirrors the predicate above so the "busy" list the client sees matches what
-- the trigger will actually enforce (previously it only listed sessions
-- created_by the practice admin, so client-booked / imported slots looked free).
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
$func$;

grant execute on function public.get_practice_busy_slots(uuid) to authenticated;
