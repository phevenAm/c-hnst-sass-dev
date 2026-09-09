-- ─────────────────────────────────────────────────────────────────────────────
-- Demo practice calendar realism
--
-- The demo admin (Amanda, 63aeb602-…) had a flat Mon–Fri 09:00–17:00
-- availability wall, which reads at a glance like solid booked time rather
-- than open space, and the demo client (Cassie, 3d5e1d85-…) had no sessions
-- at all past mid-September 2026 so the scheduler looked empty going forward.
--
-- This migration only touches those two demo accounts' rows. No schema
-- change, so no PostgREST reload needed. Demo write-guard triggers key off
-- auth.uid() (get_my_is_demo()), which is null inside a migration, so these
-- inserts pass.
-- ─────────────────────────────────────────────────────────────────────────────

do $demo$
declare
  amanda constant uuid := '63aeb602-0056-4217-b120-9b6dc0c7c649';
  cassie constant uuid := '3d5e1d85-d7c6-4573-b61e-91d19daa07bb';
begin
  -- ── 1. Realistic availability: split days with lunch gaps, a midweek day
  --       off, a Friday half-day. Multiple rows per weekday render as separate
  --       "General availability" blocks with gaps between them. ───────────────
  delete from public.availability_rules where admin_id = amanda;

  insert into public.availability_rules (admin_id, day_of_week, start_time, end_time, label) values
    -- Monday: morning + afternoon
    (amanda, 1, '09:00', '13:00', 'General availability'),
    (amanda, 1, '14:00', '17:00', 'General availability'),
    -- Tuesday: later start, shorter afternoon
    (amanda, 2, '10:00', '13:00', 'General availability'),
    (amanda, 2, '14:00', '16:00', 'General availability'),
    -- Wednesday: no rows — day off
    -- Thursday: three shorter blocks
    (amanda, 4, '09:00', '11:30', 'General availability'),
    (amanda, 4, '12:30', '15:00', 'General availability'),
    (amanda, 4, '15:30', '18:00', 'General availability'),
    -- Friday: half day
    (amanda, 5, '09:00', '13:00', 'General availability');

  -- ── 2. Cassie's ongoing weekly session — Mondays 10:00, from late Sep 2026
  --       through to the end of June 2027. Falls inside the Monday morning
  --       window above. ────────────────────────────────────────────────────────
  insert into public.sessions
    (client_id, created_by, scheduled_at, duration_minutes, status, paid, attended, location, price_pence)
  select
    cassie,
    amanda,
    ts,
    50,
    'scheduled'::session_status,
    false,
    null,
    case when (row_number() over (order by ts)) % 4 = 0 then 'in_person' else 'remote' end,
    6000
  from generate_series(
    timestamptz '2026-09-21 10:00:00+00',
    timestamptz '2027-06-28 10:00:00+00',
    interval '7 days'
  ) as ts;
end
$demo$;
