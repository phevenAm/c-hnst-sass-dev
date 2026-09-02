-- ─────────────────────────────────────────────────────────────────────────────
-- Microsoft 365 / Outlook calendar sync + Teams meeting links (admin only).
--
-- The Microsoft twin of the Google Calendar integration (20260818000004):
-- an admin connects their Microsoft work/school account (OAuth), and from
-- then on every session create/reschedule/cancel pushes a matching event to
-- their Outlook calendar via the sync-microsoft-calendar-event edge function.
--
-- Extra over the Google version: for ONLINE sessions, the pushed event is
-- created as a Teams meeting (Graph `isOnlineMeeting`), and the resulting
-- joinUrl is written back onto the session so every existing "Join meeting"
-- link in the UI (which reads sessions.address) works with no frontend
-- change. The joinUrl is also kept in sessions.teams_join_url as the
-- canonical record. Creating Teams links needs an M365 Business account with
-- a Teams licence; the create_teams_links flag lets a practitioner on a
-- personal account keep the calendar sync without it.
--
-- Tokens never reach the browser: admin_microsoft_calendar has RLS enabled
-- with NO policies. All access is via:
--   - get_microsoft_calendar_status()          — SECURITY DEFINER, no tokens
--   - set_microsoft_calendar_sync_enabled()    — SECURITY DEFINER, toggle
--   - set_microsoft_teams_links_enabled()      — SECURITY DEFINER, toggle
--   - microsoft-calendar-oauth / -disconnect   — edge functions (service role)
--
-- Setup required in Supabase dashboard → Edge Functions → Secrets:
--   MICROSOFT_CALENDAR_CLIENT_ID
--   MICROSOFT_CALENDAR_CLIENT_SECRET
--   MICROSOFT_CALENDAR_TENANT      (usually "common"; a single-tenant app
--                                   uses its directory (tenant) ID instead)
--   INTERNAL_MSCAL_SYNC_SECRET     (must match the Vault secret below)
-- and the browser env var:
--   VITE_MICROSOFT_CALENDAR_CLIENT_ID
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.admin_microsoft_calendar (
  admin_id                uuid primary key references public.users(id) on delete cascade,
  microsoft_email         text,
  refresh_token           text not null,
  access_token            text,
  access_token_expires_at timestamptz,
  sync_enabled            boolean not null default true,
  -- When false, events still sync to Outlook but are NOT created as Teams
  -- meetings (no joinUrl generated). For practitioners without a licensed
  -- Teams account.
  create_teams_links      boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.admin_microsoft_calendar enable row level security;
-- Intentionally no policies — see header comment.

alter table public.sessions
  add column if not exists microsoft_event_id text,
  add column if not exists teams_join_url text;

-- ── Vault secret for SQL → edge-function auth (mirrors internal_gcal_sync_secret) ──
select vault.create_secret(
  'ms-sync-placeholder-set-via-supabase-secrets',
  'internal_mscal_sync_secret',
  'x-internal-secret for calls to the sync-microsoft-calendar-event edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_mscal_sync_secret');

-- ── Status RPC — never returns tokens ────────────────────────────────────────
create or replace function public.get_microsoft_calendar_status()
returns table (connected boolean, microsoft_email text, sync_enabled boolean, create_teams_links boolean)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_row public.admin_microsoft_calendar;
begin
  select * into v_row from public.admin_microsoft_calendar where admin_id = auth.uid();
  if v_row.admin_id is null then
    return query select false, null::text, false, false;
  else
    return query select true, v_row.microsoft_email, v_row.sync_enabled, v_row.create_teams_links;
  end if;
end;
$func$;

grant execute on function public.get_microsoft_calendar_status() to authenticated;

create or replace function public.set_microsoft_calendar_sync_enabled(p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $func$
  update public.admin_microsoft_calendar
  set sync_enabled = p_enabled, updated_at = now()
  where admin_id = auth.uid();
$func$;

grant execute on function public.set_microsoft_calendar_sync_enabled(boolean) to authenticated;

create or replace function public.set_microsoft_teams_links_enabled(p_enabled boolean)
returns void
language sql
security definer
set search_path = public
as $func$
  update public.admin_microsoft_calendar
  set create_teams_links = p_enabled, updated_at = now()
  where admin_id = auth.uid();
$func$;

grant execute on function public.set_microsoft_teams_links_enabled(boolean) to authenticated;

-- ── Trigger: push session changes to Outlook / Teams ─────────────────────────
create or replace function public.trigger_microsoft_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_id uuid;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'internal_mscal_sync_secret');
begin
  if tg_op = 'DELETE' then
    if old.created_by is null or old.microsoft_event_id is null then
      return old;
    end if;
    if not exists (
      select 1 from public.admin_microsoft_calendar
      where admin_id = old.created_by and sync_enabled = true
    ) then
      return old;
    end if;
    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/sync-microsoft-calendar-event',
      body    := jsonb_build_object(
        'action', 'delete',
        'admin_id', old.created_by,
        'microsoft_event_id', old.microsoft_event_id
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
    select 1 from public.admin_microsoft_calendar
    where admin_id = v_admin_id and sync_enabled = true
  ) then
    return new;
  end if;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/sync-microsoft-calendar-event',
    body    := jsonb_build_object(
      'action', case when new.status = 'cancelled' then 'delete' else 'upsert' end,
      'admin_id', v_admin_id,
      'session_id', new.id,
      'microsoft_event_id', new.microsoft_event_id
    ),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', v_secret
    )
  );

  return new;
end;
$func$;

drop trigger if exists sessions_microsoft_calendar_sync on public.sessions;
create trigger sessions_microsoft_calendar_sync
  after insert or delete or update of scheduled_at, duration_minutes, status, location, address
  on public.sessions
  for each row execute function public.trigger_microsoft_calendar_sync();
