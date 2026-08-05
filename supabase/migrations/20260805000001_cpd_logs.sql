-- ─────────────────────────────────────────────────────────────────────────────
-- CPD Log
-- Tracks continuing professional development activities per admin/counsellor.
-- Supervision entries use session_number, contract_code, mode, venue,
-- issues_raised, supervisor_name. Other types use title + notes.
-- ─────────────────────────────────────────────────────────────────────────────

create type public.cpd_activity_type as enum (
  'supervision',
  'training',
  'reading',
  'conference',
  'peer_consultation',
  'personal_therapy',
  'other'
);

create table public.cpd_logs (
  id                  uuid primary key default gen_random_uuid(),
  admin_id            uuid not null references auth.users(id) on delete cascade,
  date                date not null,
  activity_type       public.cpd_activity_type not null default 'supervision',

  -- Supervision-specific
  session_number      integer,          -- auto-suggested, editable
  contract_code       text,             -- supervision contract identifier
  mode                text,             -- 'remote' | 'in_person'
  venue               text,
  issues_raised       text,
  supervisor_name     text,

  -- General CPD
  title               text,             -- activity / course / book name
  provider            text,             -- organisation or person delivering it
  duration_minutes    integer,          -- hours claimed
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Index for fast per-admin queries
create index cpd_logs_admin_id_idx on public.cpd_logs(admin_id);
create index cpd_logs_date_idx on public.cpd_logs(admin_id, date desc);

-- Auto-update updated_at
create or replace function public.set_updated_at()
  returns trigger language plpgsql as $func$
  begin new.updated_at = now(); return new; end;
$func$;

create trigger cpd_logs_updated_at
  before update on public.cpd_logs
  for each row execute function public.set_updated_at();

-- RLS
alter table public.cpd_logs enable row level security;

create policy "admins manage own cpd logs"
  on public.cpd_logs
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- ── Annual target on practice_settings ───────────────────────────────────────

alter table public.practice_settings
  add column if not exists cpd_annual_target_hours integer not null default 30;
