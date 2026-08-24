-- ─────────────────────────────────────────────────────────────────────────────
-- Admin session-prep reminders (todo a1906686 / bulk booking follow-up).
--
-- Distinct from the existing client-facing send-session-reminders edge
-- function (practice_settings.reminder_hours_before): this reminds the ADMIN,
-- in-app only, shortly before their own session so they can review the
-- client's history first. Delivery is a plain notifications row — no email,
-- no edge function needed.
--
-- Note content itself is never touched here: session_notes.content is
-- client-side AES-256-GCM encrypted, so nothing server-side can read it. The
-- notification only deep-links to the client's page; decrypting and
-- rendering the "up to speed" summary happens entirely in the browser.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.practice_settings
  add column if not exists admin_reminders_enabled boolean not null default true,
  add column if not exists admin_reminder_lead_minutes integer not null default 1440
    check (admin_reminder_lead_minutes > 0),
  add column if not exists admin_reminder_summary_fields text[] not null default array['previous_session', 'client_summary'];

comment on column public.practice_settings.admin_reminders_enabled is
  'Master toggle for admin session-prep reminders.';
comment on column public.practice_settings.admin_reminder_lead_minutes is
  'How long before a session the admin gets reminded. E.g. 60 = 1hr, 180 = 3hr, 1440 = 1 day, 2880 = 2 days.';
comment on column public.practice_settings.admin_reminder_summary_fields is
  'Free-form list of section keys the admin wants on the pre-session prep view. Interpreted client-side only.';

-- ── Per-client mute list (real clients or shadow-client stubs) ──────────────

create table if not exists public.admin_reminder_mutes (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users (id) on delete cascade,
  client_id  uuid references public.users (id) on delete cascade,
  stub_id    uuid references public.client_stubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint admin_reminder_mutes_one_target check (
    (client_id is not null)::int + (stub_id is not null)::int = 1
  )
);

create unique index if not exists admin_reminder_mutes_admin_client_uidx
  on public.admin_reminder_mutes (admin_id, client_id) where client_id is not null;
create unique index if not exists admin_reminder_mutes_admin_stub_uidx
  on public.admin_reminder_mutes (admin_id, stub_id) where stub_id is not null;

alter table public.admin_reminder_mutes enable row level security;

drop policy if exists "admins manage own reminder mutes" on public.admin_reminder_mutes;
create policy "admins manage own reminder mutes"
  on public.admin_reminder_mutes
  for all
  using (
    admin_id = auth.uid()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  )
  with check (
    admin_id = auth.uid()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

-- ── Send-once tracking on the sessions themselves ────────────────────────────

alter table public.sessions
  add column if not exists admin_reminder_sent_at timestamptz;
alter table public.stub_sessions
  add column if not exists admin_reminder_sent_at timestamptz;

-- ── Cron: scan for sessions entering their admin's lead-time window ─────────

create or replace function public.send_admin_session_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Real sessions
  with due as (
    update public.sessions s
    set admin_reminder_sent_at = now()
    from public.practice_settings ps
    where ps.admin_id = s.created_by
      and s.status = 'scheduled'
      and s.admin_reminder_sent_at is null
      and ps.admin_reminders_enabled = true
      and s.scheduled_at > now()
      and s.scheduled_at <= now() + (ps.admin_reminder_lead_minutes * interval '1 minute')
      and not exists (
        select 1 from public.admin_reminder_mutes m
        where m.admin_id = ps.admin_id and m.client_id = s.client_id
      )
    returning s.id, s.client_id, s.scheduled_at, s.created_by as admin_id
  )
  insert into public.notifications (user_id, type, message, url)
  select
    due.admin_id,
    'session_prep_reminder',
    coalesce(u.first_name, 'A client') || '''s session is on ' ||
      to_char(due.scheduled_at, 'DD Mon [at] HH24:MI') || ' — review their notes before you meet',
    '/admin/clients/' || due.client_id || '?session=' || due.id
  from due
  join public.users u on u.id = due.client_id;

  -- Shadow-client stub sessions
  with due as (
    update public.stub_sessions ss
    set admin_reminder_sent_at = now()
    from public.practice_settings ps
    where ps.admin_id = ss.admin_id
      and ss.status = 'scheduled'
      and ss.admin_reminder_sent_at is null
      and ps.admin_reminders_enabled = true
      and ss.scheduled_at > now()
      and ss.scheduled_at <= now() + (ps.admin_reminder_lead_minutes * interval '1 minute')
      and not exists (
        select 1 from public.admin_reminder_mutes m
        where m.admin_id = ps.admin_id and m.stub_id = ss.stub_id
      )
    returning ss.id, ss.stub_id, ss.scheduled_at, ss.admin_id
  )
  insert into public.notifications (user_id, type, message, url)
  select
    due.admin_id,
    'session_prep_reminder',
    coalesce(cs.first_name, 'A client') || '''s session is on ' ||
      to_char(due.scheduled_at, 'DD Mon [at] HH24:MI') || ' — review their notes before you meet',
    '/admin/clients/stub/' || due.stub_id || '?session=' || due.id
  from due
  join public.client_stubs cs on cs.id = due.stub_id;
end;
$func$;

select cron.schedule(
  'send-admin-session-reminders',
  '*/15 * * * *',
  'select public.send_admin_session_reminders()'
);
