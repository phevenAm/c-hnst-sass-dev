-- ─────────────────────────────────────────────────────────────────────────────
-- Agencies, part 1 of 5: core tables + the manager-visibility helper.
--
-- A counselling agency is one account holding several admins ("members"), each
-- running their own caseload, overseen by one or more agency MANAGERS. A
-- manager works in a dedicated "manage mode" — they do not (necessarily) see
-- clients themselves; they invite/manage other admins, create client intake
-- records and assign them out, and set agency-wide policy.
--
-- Billing is deliberately NOT modelled here — seat tiers, Stripe products, and
-- who-pays-whom (agency vs freelancer) are a later phase. `employment_type`
-- exists as a column so the UI can capture it now; nothing enforces off it yet.
--
-- This migration:
--   * public.agencies         — the account + its policy switches
--   * public.agency_members   — membership, role, status (one agency per user)
--   * public.users.agency_id  — denormalised, for fast RLS
--   * helper fns: current_agency_id(), is_agency_manager(), acts_for_admin()
--
-- The per-tenant-table policies that USE acts_for_admin() land in
-- 20260902000003_agency_manager_rls.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agencies ────────────────────────────────────────────────────────────────
create table if not exists public.agencies (
  id                      uuid        primary key default gen_random_uuid(),
  name                    text        not null,
  owner_id                uuid        not null references auth.users(id) on delete restrict,

  -- Policy switches. When a switch is on, the corresponding member-admin
  -- setting is overridden by the agency value (read paths honour these in
  -- 20260902000004 / the app).
  locked_consent          boolean     not null default false,
  consent_text            text,
  consent_pdf_url         text,
  shared_resources        boolean     not null default false,
  require_note_encryption boolean     not null default false,
  locked_email_templates  boolean     not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists agencies_set_updated_at on public.agencies;
create trigger agencies_set_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

-- ── agency_members ──────────────────────────────────────────────────────────
-- One row per admin in an agency. `unique (user_id)` = an admin belongs to at
-- most one agency. role='manager' unlocks manage mode; counselling_enabled=false
-- is a manager who does no client work (the app hides the /admin tree for them).
create table if not exists public.agency_members (
  id                  uuid        primary key default gen_random_uuid(),
  agency_id           uuid        not null references public.agencies(id) on delete cascade,
  user_id             uuid        not null references auth.users(id) on delete cascade,
  role                text        not null default 'counsellor'
                                  check (role in ('manager', 'counsellor')),
  employment_type     text        not null default 'employee'
                                  check (employment_type in ('employee', 'freelance')),
  counselling_enabled boolean     not null default true,
  status              text        not null default 'active'
                                  check (status in ('active', 'disabled')),
  invited_at          timestamptz,
  joined_at           timestamptz not null default now(),
  unique (user_id)
);

create index if not exists agency_members_agency_id_idx on public.agency_members (agency_id);

-- ── users.agency_id ─────────────────────────────────────────────────────────
-- Mirrors agency_members.agency_id for the active membership. Set on join,
-- cleared on removal. Denormalised purely so RLS predicates and app queries
-- don't need a join every time.
alter table public.users
  add column if not exists agency_id uuid references public.agencies(id) on delete set null;

create index if not exists users_agency_id_idx on public.users (agency_id);

-- ── helpers ─────────────────────────────────────────────────────────────────
-- All SECURITY DEFINER so they bypass RLS on agency_members — policies below
-- call them, which would otherwise recurse.

create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $func$
  select agency_id
  from public.agency_members
  where user_id = auth.uid()
    and status = 'active';
$func$;

create or replace function public.is_agency_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from public.agency_members
    where user_id = auth.uid()
      and role = 'manager'
      and status = 'active'
  );
$func$;

-- The workhorse for cross-member visibility: true when p_admin is the caller,
-- OR the caller is an ACTIVE MANAGER in the same agency as p_admin. Every
-- per-tenant-table policy added in ...0003 is `using (acts_for_admin(<owner>))`.
create or replace function public.acts_for_admin(p_admin uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select
    p_admin = auth.uid()
    or exists (
      select 1
      from public.agency_members me
      join public.agency_members target on target.agency_id = me.agency_id
      where me.user_id = auth.uid()
        and me.role = 'manager'
        and me.status = 'active'
        and target.user_id = p_admin
    );
$func$;

revoke execute on function public.current_agency_id() from anon;
revoke execute on function public.is_agency_manager() from anon;
revoke execute on function public.acts_for_admin(uuid) from anon;
grant execute on function public.current_agency_id() to authenticated;
grant execute on function public.is_agency_manager() to authenticated;
grant execute on function public.acts_for_admin(uuid) to authenticated;

-- ── RLS: agencies ───────────────────────────────────────────────────────────
alter table public.agencies enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agencies' and policyname='members read their agency') then
    execute $pol$
      create policy "members read their agency" on public.agencies
        for select to authenticated
        using (id = public.current_agency_id())
    $pol$;
  end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agencies' and policyname='owner creates agency') then
    execute $pol$
      create policy "owner creates agency" on public.agencies
        for insert to authenticated
        with check (owner_id = auth.uid())
    $pol$;
  end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agencies' and policyname='managers update their agency') then
    execute $pol$
      create policy "managers update their agency" on public.agencies
        for update to authenticated
        using (id = public.current_agency_id() and public.is_agency_manager())
        with check (id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;
end $func$;

-- ── RLS: agency_members ─────────────────────────────────────────────────────
alter table public.agency_members enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_members' and policyname='members read co-members') then
    execute $pol$
      create policy "members read co-members" on public.agency_members
        for select to authenticated
        using (agency_id = public.current_agency_id())
    $pol$;
  end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_members' and policyname='managers write members') then
    execute $pol$
      create policy "managers write members" on public.agency_members
        for all to authenticated
        using (agency_id = public.current_agency_id() and public.is_agency_manager())
        with check (agency_id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;
end $func$;

grant select, insert, update, delete on public.agencies       to authenticated;
grant select, insert, update, delete on public.agency_members to authenticated;
