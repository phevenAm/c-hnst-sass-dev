-- Three SQL functions had internal service-to-service secrets hardcoded as
-- string literals in their bodies (used to authenticate calls from SQL to
-- an edge function, verified against INTERNAL_SECRET-style env vars there):
--   - delete_own_account() / delete_user_by_id() -> delete-user-avatar
--   - auto_cancel_unpaid_sessions()               -> notify-auto-cancelled
--   - trigger_google_calendar_sync()              -> sync-google-calendar-event
-- Not externally reachable today (pg_get_functiondef isn't exposed via
-- PostgREST, confirmed live), but hardcoding secrets in function source is
-- bad practice regardless — anyone with SQL editor / dashboard access sees
-- them in plain text, and they're baked into every future pg_dump. Moving
-- them into Supabase Vault, read via vault.decrypted_secrets at call time
-- instead of embedded as literals. The header value the edge functions
-- receive is unchanged, so nothing on the Deno side needs to change.

select vault.create_secret(
  'wm-avatar-cleanup-8f4e2a1c9b3d',
  'internal_avatar_cleanup_secret',
  'x-internal-secret for calls to the delete-user-avatar edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_avatar_cleanup_secret');

select vault.create_secret(
  'ac-nl-cancel-e71a3b8c',
  'internal_auto_cancel_secret',
  'x-internal-secret for calls to the notify-auto-cancelled edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_auto_cancel_secret');

select vault.create_secret(
  'gc-sync-f3a9d1e2',
  'internal_gcal_sync_secret',
  'x-internal-secret for calls to the sync-google-calendar-event edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_gcal_sync_secret');

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.users where id = v_uid;
  delete from auth.users where id = v_uid;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
    body    := jsonb_build_object('user_id', v_uid::text),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_avatar_cleanup_secret')
    )
  );
end;
$func$;

create or replace function public.delete_user_by_id(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
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
end;
$func$;

create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_session_id uuid;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'internal_auto_cancel_secret');
begin
  -- Real sessions: cancel and email each affected client
  for v_session_id in
    update public.sessions s
    set status = 'cancelled'
    from public.practice_settings ps
    where ps.admin_id       = s.created_by
      and ps.auto_cancel_enabled = true
      and s.status          = 'scheduled'
      and s.paid            = false
      and s.scheduled_at   <= now() + (ps.payment_deadline_hours * interval '1 hour')
    returning s.id
  loop
    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-auto-cancelled',
      body    := jsonb_build_object('session_id', v_session_id),
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', v_secret
      )
    );
  end loop;

  -- Stub sessions: cancel only (offline clients have no email address)
  update public.stub_sessions ss
  set status = 'cancelled'
  from public.practice_settings ps
  where ps.admin_id           = ss.admin_id
    and ps.auto_cancel_enabled = true
    and ss.status             = 'scheduled'
    and ss.amount_paid        is null
    and ss.scheduled_at      <= now() + (ps.payment_deadline_hours * interval '1 hour');
end;
$func$;

create or replace function public.trigger_google_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_id uuid;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'internal_gcal_sync_secret');
begin
  if tg_op = 'DELETE' then
    if old.created_by is null or old.google_event_id is null then
      return old;
    end if;
    if not exists (
      select 1 from public.admin_google_calendar
      where admin_id = old.created_by and sync_enabled = true
    ) then
      return old;
    end if;
    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/sync-google-calendar-event',
      body    := jsonb_build_object(
        'action', 'delete',
        'admin_id', old.created_by,
        'google_event_id', old.google_event_id
      ),
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', v_secret
      )
    );
    return old;
  end if;

  v_admin_id := new.created_by;
  if v_admin_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.admin_google_calendar
    where admin_id = v_admin_id and sync_enabled = true
  ) then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/sync-google-calendar-event',
    body    := jsonb_build_object(
      'action', case when new.status = 'cancelled' then 'delete' else 'upsert' end,
      'admin_id', v_admin_id,
      'session_id', new.id,
      'google_event_id', new.google_event_id
    ),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', v_secret
    )
  );

  return new;
end;
$func$;

-- CREATE OR REPLACE FUNCTION keeps the same OID and preserves existing
-- grants/ownership — the anon/PUBLIC revokes from 20260826000013 on these
-- four functions still apply, nothing to reassert here.
