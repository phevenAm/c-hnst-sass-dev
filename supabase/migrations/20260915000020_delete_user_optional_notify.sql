-- Admin hard-delete (delete_user_by_id) was the one client-lifecycle
-- transition that never told the client anything — deactivate, reactivate,
-- and self-close all email a notice via notify_client_lifecycle(), delete
-- did not. Adds an admin-controlled opt-in: a new `p_notify` argument
-- (default false — the FE checkbox drives this explicitly, unlike the other
-- three transitions which always notify).
--
-- notify_client_lifecycle() gains optional p_first_name / p_admin_id: by the
-- time the edge function would normally look these up from public.users, this
-- RPC has already deleted that row, so they're captured here beforehand and
-- passed straight through in the request body instead. The other two callers
-- (admin_archive_client, admin_unarchive_client, delete_own_account) don't
-- pass them and are unaffected — the edge function still falls back to its
-- own lookup when they're omitted.

alter table public.email_logs drop constraint if exists email_logs_email_type_check;

alter table public.email_logs
  add constraint email_logs_email_type_check check (email_type = any (array[
    'session_reminder',
    'session_booked',
    'session_cancelled',
    'session_rescheduled',
    'session_restored',
    'payment_reminder',
    'payment_confirmed',
    'questionnaire_assigned',
    'stub_invite',
    'stub_joined',
    'feedback',
    'reschedule_request',
    'client_invite',
    'account_deactivated',
    'account_reactivated',
    'account_closed',
    'account_deleted',
    'agency_member_invite',
    'agency_client_assigned',
    'invoice',
    'new_message'
  ]));

-- Adding two trailing default params changes the argument-type signature
-- ((uuid,text,text) -> (uuid,text,text,text,uuid)), so CREATE OR REPLACE
-- would create a second overload rather than replace the original. Drop it
-- first so every caller — the three existing 3-arg ones included, which are
-- untouched by this migration — resolves to the one function below.
drop function if exists public.notify_client_lifecycle(uuid, text, text);

create function public.notify_client_lifecycle(
  p_user_id    uuid,
  p_event      text,
  p_email      text,
  p_first_name text default null,
  p_admin_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if p_email is null or p_email = '' or p_email like '%@deleted.invalid' then
    return;
  end if;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-client-lifecycle',
    body    := jsonb_build_object(
      'event', p_event,
      'user_id', p_user_id::text,
      'client_email', p_email,
      'first_name', p_first_name,
      'admin_id', p_admin_id::text
    ),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_client_lifecycle_secret')
    )
  );
end;
$func$;

-- Same overload trap as above: (uuid) -> (uuid,boolean) is a new signature.
drop function if exists public.delete_user_by_id(uuid);

create function public.delete_user_by_id(target_user_id uuid, p_notify boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_email      text;
  v_first_name text;
  v_admin_id   uuid;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Unauthorized';
  end if;

  if exists (
    select 1 from public.users
    where id = target_user_id and is_root_admin = true
  ) then
    raise exception 'Cannot delete the root admin account';
  end if;

  if not exists (
    select 1 from public.users
    where id = target_user_id and admin_id = auth.uid()
  ) then
    raise exception 'Cannot delete a client that does not belong to your practice';
  end if;

  -- Capture before either row is gone — delete_user_by_id, unlike archive/
  -- self-close, actually removes public.users, so nothing here is readable
  -- once the deletes below run.
  select u.first_name, u.admin_id, a.email
  into v_first_name, v_admin_id, v_email
  from public.users u
  join auth.users a on a.id = u.id
  where u.id = target_user_id;

  delete from public.users where id = target_user_id;
  delete from auth.users where id = target_user_id;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
    body    := jsonb_build_object('user_id', target_user_id::text),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_avatar_cleanup_secret')
    )
  );

  if p_notify then
    perform public.notify_client_lifecycle(target_user_id, 'deleted', v_email, v_first_name, v_admin_id);
  end if;
end;
$func$;

revoke execute on function public.notify_client_lifecycle(uuid, text, text, text, uuid) from anon, authenticated;

-- Dropping delete_user_by_id(uuid) above also dropped its grants — the
-- original 2026-08-26 anon lockdown revoke targeted that exact signature and
-- doesn't carry over to the new one. Reassert it here: anon blocked,
-- authenticated explicit (belt-and-braces alongside Postgres's default
-- PUBLIC-execute-on-create, since the frontend calls this directly).
revoke execute on function public.delete_user_by_id(uuid, boolean) from anon;
grant execute on function public.delete_user_by_id(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
