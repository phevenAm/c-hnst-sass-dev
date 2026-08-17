-- ─────────────────────────────────────────────────────────────────────────────
-- Admin notification for every client email (todo a97d229c)
--
-- Instead of modifying each of the 10+ edge functions, a BEFORE INSERT trigger
-- on email_logs pushes a notification to the admin's notification feed whenever
-- an email is sent to a client. Admins can see this in the sidebar badge /
-- notifications panel without leaving the app.
--
-- Notifications are only created when:
--   • admin_id and client_id are both present (not feedback or internal emails)
--   • status = 'sent' (don't notify for skipped or failed)
--   • The email was sent to a client (client_id IS NOT NULL)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_admin_email_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_client_name text;
begin
  -- Only notify for successfully sent client-facing emails
  if new.status <> 'sent' then
    return new;
  end if;

  if new.admin_id is null or new.client_id is null then
    return new;
  end if;

  -- Get client display name (first_name or fall back to 'A client')
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

drop trigger if exists email_log_admin_notify on public.email_logs;
create trigger email_log_admin_notify
  after insert on public.email_logs
  for each row execute function public.notify_admin_email_sent();
