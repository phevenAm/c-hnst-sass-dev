-- ─────────────────────────────────────────────────────────────────────────────
-- Google Calendar sync (one-way push, admin only).
--
-- Admin connects their Google account (OAuth). From then on, every session
-- create/reschedule/cancel pushes a matching event to their primary Google
-- Calendar via the sync-google-calendar-event edge function.
--
-- Tokens are never exposed to the browser: admin_google_calendar has RLS
-- enabled with NO policies, so authenticated/anon can't select/insert/update/
-- delete it directly. All access goes through:
--   - get_google_calendar_status() — SECURITY DEFINER RPC, read-only, no tokens
--   - set_google_calendar_sync_enabled() — SECURITY DEFINER RPC, toggles pause
--   - google-calendar-oauth / google-calendar-disconnect edge functions (service role)
--
-- Setup required in Supabase dashboard → Settings → Edge Functions → Secrets:
--   GOOGLE_CALENDAR_CLIENT_ID
--   GOOGLE_CALENDAR_CLIENT_SECRET
--   INTERNAL_GOOGLE_SYNC_SECRET = gc-sync-f3a9d1e2
-- ─────────────────────────────────────────────────────────────────────────────

create table public.admin_google_calendar (
  admin_id uuid primary key references public.users(id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_google_calendar enable row level security;
-- Intentionally no policies — see header comment.

alter table public.sessions
  add column if not exists google_event_id text;

-- ── Status RPC — never returns tokens ──────────────────────────────────────
create or replace function public.get_google_calendar_status()
returns table (connected boolean, google_email text, sync_enabled boolean)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_row public.admin_google_calendar;
begin
  select * into v_row from public.admin_google_calendar where admin_id = auth.uid();
  if v_row.admin_id is null then
    return query select false, null::text, false;
  else
    return query select true, v_row.google_email, v_row.sync_enabled;
  end if;
end;
$func$;

grant execute on function public.get_google_calendar_status() to authenticated;

create or replace function public.set_google_calendar_sync_enabled(p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $func$
  update public.admin_google_calendar
  set sync_enabled = p_enabled, updated_at = now()
  where admin_id = auth.uid();
$func$;

grant execute on function public.set_google_calendar_sync_enabled(boolean) to authenticated;

-- ── Trigger: push session changes to Google ────────────────────────────────
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
      )::text,
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
    )::text,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', 'gc-sync-f3a9d1e2'
    )
  );

  return new;
end;
$func$;

drop trigger if exists sessions_google_calendar_sync on public.sessions;
create trigger sessions_google_calendar_sync
  after insert or delete or update of scheduled_at, duration_minutes, status, location, address
  on public.sessions
  for each row execute function public.trigger_google_calendar_sync();
