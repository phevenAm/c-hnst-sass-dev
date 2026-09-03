-- ─────────────────────────────────────────────────────────────────────────────
-- Agency → Microsoft Teams channel notifications.
--
-- A one-way feed: when a member of the agency books / cancels / gets paid for
-- a session, Clarity POSTs a card to a Teams channel the agency manager has
-- wired up. Uses an Incoming Webhook / Workflows URL — no Graph API, no OAuth,
-- no admin consent. The manager creates the webhook in Teams and pastes the
-- URL here.
--
-- One row per agency. Only that agency's managers can see or change it (the
-- webhook URL is effectively a secret). The edge functions read it with the
-- service role — see supabase/functions/_shared/agencyTeams.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.agency_teams_channel (
  agency_id        uuid        primary key references public.agencies(id) on delete cascade,
  webhook_url      text        not null,
  notify_booked    boolean     not null default true,
  notify_cancelled boolean     not null default true,
  notify_paid      boolean     not null default true,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists agency_teams_channel_set_updated_at on public.agency_teams_channel;
create trigger agency_teams_channel_set_updated_at
  before update on public.agency_teams_channel
  for each row execute function public.set_updated_at();

alter table public.agency_teams_channel enable row level security;

-- Managers of THIS agency only. A user belongs to at most one agency
-- (agency_members.unique(user_id)), so this also naturally scopes to their own.
drop policy if exists "agency managers manage their teams channel" on public.agency_teams_channel;
create policy "agency managers manage their teams channel"
  on public.agency_teams_channel for all
  to authenticated
  using (
    exists (
      select 1 from public.agency_members m
      where m.agency_id = agency_teams_channel.agency_id
        and m.user_id = auth.uid()
        and m.role = 'manager'
        and m.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.agency_members m
      where m.agency_id = agency_teams_channel.agency_id
        and m.user_id = auth.uid()
        and m.role = 'manager'
        and m.status = 'active'
    )
  );

grant select, insert, update, delete on public.agency_teams_channel to authenticated;
