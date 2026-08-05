-- Returns busy time ranges for the caller's practice so clients can avoid
-- already-booked slots in the reschedule picker. Uses SECURITY DEFINER so it
-- can read sessions across all clients in the practice without exposing
-- personal data — only start/end timestamps are returned.
--
-- Sessions are owned by the admin via `created_by`. For a client caller,
-- their `admin_id` in the users table is that admin's ID.
--
-- exclude_session_id (optional): omit the session being rescheduled so its
-- own slot doesn't appear as a conflict.

create or replace function get_practice_busy_slots(exclude_session_id uuid default null)
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
$func$;

grant execute on function get_practice_busy_slots(uuid) to authenticated;
