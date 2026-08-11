-- supervision_sessions: manual supervision log entries
create table if not exists public.supervision_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  supervisor_name text,
  duration_minutes integer,
  cost_pence integer,
  currency text not null default 'GBP',
  mode text check (mode in ('remote', 'in_person')),
  session_number integer,
  contract_code text,
  issues_raised text,
  venue text,
  notes text,
  track_as_cpd boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.supervision_sessions enable row level security;

create policy "admin owns supervision_sessions"
  on public.supervision_sessions
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- Add supervision flag + optional cost to calendar sessions
alter table public.sessions
  add column if not exists is_supervision boolean not null default false,
  add column if not exists supervision_cost_pence integer;
