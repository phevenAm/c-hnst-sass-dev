-- Offline / shadow clients. Admins can track clients who haven't signed up
-- yet — log sessions, record payments, and attach notes. When the client
-- eventually joins, the admin can link the stub to their real account.

-- ─── client_stubs ─────────────────────────────────────────────
create table public.client_stubs (
  id             uuid        primary key default gen_random_uuid(),
  created_by     uuid        not null references auth.users(id) on delete cascade,
  linked_user_id uuid        references auth.users(id) on delete set null,
  first_name     text        not null,
  last_name      text        not null,
  email          text,
  codename       text,
  created_at     timestamptz not null default now()
);

alter table public.client_stubs enable row level security;

create policy "admins manage own stubs"
  on public.client_stubs
  for all
  using (created_by = auth.uid());

-- ─── stub_sessions ────────────────────────────────────────────
-- Simple session log for offline clients. No scheduling complexity —
-- just a date, status, and optional payment record.
create table public.stub_sessions (
  id               uuid        primary key default gen_random_uuid(),
  stub_id          uuid        not null references public.client_stubs(id) on delete cascade,
  admin_id         uuid        not null references auth.users(id) on delete cascade,
  scheduled_at     timestamptz not null,
  duration_minutes integer,
  status           text        not null default 'scheduled'
                               check (status in ('scheduled', 'attended', 'no_show', 'cancelled')),
  amount_paid      numeric(10, 2),
  currency         text        not null default 'GBP',
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.stub_sessions enable row level security;

create policy "admins manage own stub sessions"
  on public.stub_sessions
  for all
  using (admin_id = auth.uid());

-- ─── session_notes: add stub_id ───────────────────────────────
-- Notes can reference either a real user or an offline stub.
-- Cascades on stub delete so notes disappear when the stub is removed.
alter table public.session_notes
  add column if not exists stub_id uuid references public.client_stubs(id) on delete cascade;

create index if not exists session_notes_stub_id_idx on public.session_notes(stub_id);

-- ─── session_notes: tighten RLS ───────────────────────────────
-- Old policy was "any admin" — change to own notes only, matching the
-- admin-isolation pattern used across the rest of the schema.
drop policy if exists "admins can manage session notes" on public.session_notes;

create policy "admins manage own session notes"
  on public.session_notes
  for all
  using (admin_id = auth.uid());

-- ─── merge_stub_to_user ───────────────────────────────────────
-- Transfers stub session_notes to a real user account and marks the
-- stub as linked. Call this once the offline client signs up and the
-- admin wants to associate their history.
create or replace function public.merge_stub_to_user(
  p_stub_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if not exists (
    select 1 from public.client_stubs
    where id = p_stub_id and created_by = auth.uid()
  ) then
    raise exception 'Not authorised or stub not found';
  end if;

  update public.session_notes
    set user_id = p_user_id, stub_id = null
    where stub_id = p_stub_id;

  update public.client_stubs
    set linked_user_id = p_user_id
    where id = p_stub_id;
end;
$func$;
