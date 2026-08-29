-- notify_admin_email_sent() (20260817000010) pushes a generic
-- "<client> was sent: <email type>" notification to the admin for every
-- client email logged as 'sent'. For a block booking, notify-block-booked
-- now posts its own richer admin notification ("<client>'s 4-session block
-- (1 Dec – 22 Dec) — £240 is booked…") with a deep link, and logs a single
-- email_logs row stamped against the earliest block session.
--
-- Without this change the admin would get both: the rich one from the edge
-- function and the generic one from this trigger. Skip the generic
-- notification when the logged email is a booking confirmation (session_booked)
-- for a session that belongs to a block — the edge function has it covered.
-- Single-session bookings are unaffected.

create or replace function public.notify_admin_email_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_client_name text;
begin
  if new.status <> 'sent' then
    return new;
  end if;

  if new.admin_id is null or new.client_id is null then
    return new;
  end if;

  -- Block-booking confirmations get a dedicated notification from
  -- notify-block-booked; don't also emit the generic one.
  if new.email_type = 'session_booked' and new.session_id is not null then
    if exists (
      select 1 from public.sessions
      where id = new.session_id
        and metadata ? 'block_id'
    ) then
      return new;
    end if;
  end if;

  select coalesce(first_name, 'A client') into v_client_name
  from public.users
  where id = new.client_id;

  insert into public.notifications (user_id, type, message)
  values (
    new.admin_id,
    'email_sent',
    v_client_name || ' was sent: ' || replace(new.email_type, '_', ' ')
  );

  return new;
end;
$func$;
