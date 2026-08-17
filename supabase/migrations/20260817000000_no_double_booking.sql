-- BEFORE INSERT OR UPDATE trigger that prevents overlapping sessions for the same admin.
-- The frontend already does an overlap check, but this closes the race-condition window
-- where two concurrent requests could both pass the frontend check simultaneously.
-- Skips: cancelled sessions, null created_by (legacy rows), and the row being updated.

create or replace function public.check_session_overlap()
returns trigger
language plpgsql
as $func$
declare
  conflict_count integer;
begin
  -- Cancelled sessions don't block slots
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Only enforce when we know who created the session
  if new.created_by is null then
    return new;
  end if;

  select count(*)
  into conflict_count
  from public.sessions
  where created_by = new.created_by
    and id != new.id
    and status != 'cancelled'
    and tstzrange(scheduled_at, scheduled_at + (duration_minutes * interval '1 minute'), '[)')
     && tstzrange(new.scheduled_at, new.scheduled_at + (new.duration_minutes * interval '1 minute'), '[)');

  if conflict_count > 0 then
    raise exception 'Session overlaps with an existing session for this practice';
  end if;

  return new;
end;
$func$;

drop trigger if exists prevent_session_double_booking on public.sessions;

create trigger prevent_session_double_booking
  before insert or update on public.sessions
  for each row execute function public.check_session_overlap();
