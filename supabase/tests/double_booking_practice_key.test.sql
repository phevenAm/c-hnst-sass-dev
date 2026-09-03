-- Manual / CI verification for 20260903000000_double_booking_practice_key.sql
--
-- Runs the migration and a battery of insert attempts inside a transaction that
-- is ROLLED BACK, so it is safe to run against any database (including prod).
-- The \ir include needs a real psql client:
--
--   psql "$DATABASE_URL" -f supabase/tests/double_booking_practice_key.test.sql
--
-- (The Management API path, `supabase db query --linked -f`, does not expand
-- \ir — inline the migration before the test block if you must use that.)
--
-- Every row of the result should start with "PASS".

begin;

\ir ../migrations/20260903000000_double_booking_practice_key.sql

create or replace function pg_temp.__dbl_book_tests() returns setof text language plpgsql as $t$
declare
  v   public.sessions%rowtype;
  d   int;
  adm uuid;
begin
  select s.* into v
  from public.sessions s
  join public.users cu on cu.id = s.client_id
  where s.status <> 'cancelled' and cu.admin_id is not null
  order by s.scheduled_at desc
  limit 1;

  if not found then
    return next 'SKIP: no seed session with a practice admin on this database';
    return;
  end if;

  d := coalesce(v.duration_minutes, 50);
  select admin_id into adm from public.users where id = v.client_id;

  -- A: same slot, created_by = the CLIENT (client self-book / reschedule).
  --    Pre-fix this inserted fine; must now be blocked.
  begin
    insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence)
    values (v.client_id, v.client_id, v.scheduled_at, d, 'scheduled', 'in_person', 0);
    return next 'FAIL A: client-booked overlap was NOT blocked';
  exception when others then
    return next 'PASS A: client-booked overlap blocked';
  end;

  -- B: same slot, created_by = NULL (stub-merge import / legacy CSV).
  --    Pre-fix check_session_overlap() bailed on NULL; must now be blocked.
  begin
    insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence)
    values (v.client_id, null, v.scheduled_at, d, 'scheduled', 'in_person', 0);
    return next 'FAIL B: null-created_by overlap was NOT blocked';
  exception when others then
    return next 'PASS B: null-created_by overlap blocked';
  end;

  -- C: +7 days, no clash -> must still succeed.
  begin
    insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence)
    values (v.client_id, v.client_id, v.scheduled_at + interval '7 days', d, 'scheduled', 'in_person', 0);
    return next 'PASS C: non-overlapping insert allowed';
  exception when others then
    return next 'FAIL C: non-overlap wrongly blocked -> ' || sqlerrm;
  end;

  -- D: back-to-back (new starts exactly when existing ends) -> half-open, allowed.
  begin
    insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence)
    values (v.client_id, v.client_id, v.scheduled_at + make_interval(mins => d), d, 'scheduled', 'in_person', 0);
    return next 'PASS D: back-to-back allowed';
  exception when others then
    return next 'FAIL D: back-to-back wrongly blocked -> ' || sqlerrm;
  end;

  -- E: same slot but the NEW row is cancelled -> not guarded, allowed.
  begin
    insert into public.sessions (client_id, created_by, scheduled_at, duration_minutes, status, location, price_pence)
    values (v.client_id, v.client_id, v.scheduled_at, d, 'cancelled', 'in_person', 0);
    return next 'PASS E: cancelled row not guarded';
  exception when others then
    return next 'FAIL E: cancelled row wrongly blocked -> ' || sqlerrm;
  end;

  -- F: overlapping STUB session for the same practice -> blocked by
  --    check_stub_session_overlap via the shared predicate.
  begin
    insert into public.stub_sessions (admin_id, scheduled_at, duration_minutes, status)
    values (adm, v.scheduled_at, d, 'scheduled');
    return next 'FAIL F: stub overlap with real session was NOT blocked';
  exception when others then
    return next 'PASS F: stub overlap with real session blocked';
  end;
end;
$t$;

select * from pg_temp.__dbl_book_tests();

rollback;
