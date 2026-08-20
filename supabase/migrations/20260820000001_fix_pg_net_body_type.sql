-- Every net.http_post() call in this project was written with
-- `body := jsonb_build_object(...)::text` — but net.http_post's real
-- signature takes `body jsonb`, not text. That mismatch is a genuine
-- "function does not exist" error regardless of pg_net being installed, so
-- these have been broken since the day they were written: auto-cancel
-- notifications, avatar cleanup on account deletion (both the self-delete
-- and admin-delete paths), and Google Calendar sync. Confirmed by actually
-- running auto_cancel_unpaid_sessions() after enabling pg_net (previous
-- migration) — it failed with exactly this signature error. Fix: drop the
-- stray ::text casts so body is passed as jsonb like the function expects.

create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_session_id uuid;
begin
  -- ── Real sessions: cancel and email each affected client ──────────────────
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
        'x-internal-secret', 'ac-nl-cancel-e71a3b8c'
      )
    );
  end loop;

  -- ── Stub sessions: cancel only (offline clients have no email address) ────
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

create or replace function public.delete_own_account()
returns void as $func$
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
      'x-internal-secret', 'wm-avatar-cleanup-8f4e2a1c9b3d'
    )
  );
end;
$func$ language plpgsql security definer;

create or replace function public.delete_user_by_id(target_user_id uuid)
returns void as $func$
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
      'x-internal-secret', 'wm-avatar-cleanup-8f4e2a1c9b3d'
    )
  );
end;
$func$ language plpgsql security definer;

create or replace function public.trigger_google_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_id uuid;
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
        'x-internal-secret', 'gc-sync-f3a9d1e2'
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
      'x-internal-secret', 'gc-sync-f3a9d1e2'
    )
  );

  return new;
end;
$func$;
