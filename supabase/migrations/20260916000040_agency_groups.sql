-- ─────────────────────────────────────────────────────────────────────────────
-- Agency Groups (v1): clients grouped for group-therapy-style caseloads.
--
-- Scope of this pass: groups as an organisational construct — create a group,
-- add/remove client members (real users or offline client_stubs) and staff,
-- see a client's group membership from their detail page. Deliberately NOT
-- included here (open design questions, see
-- memory/project_agency_next_session_plan_20260916.md): booking an actual
-- group SESSION (payment model unresolved — split vs flat vs per-member rate
-- lock) and calendar rendering. That's the natural next migration once the
-- payment model is decided; this schema doesn't block it.
--
--   * groups: one row per group, owned by the agency
--   * group_members: many-to-many, client_id XOR stub_id (mirrors how a
--     client_assignments target can be a real user or a stub)
--   * group_staff: many-to-many, which admins facilitate a group
--
-- RLS: a manager (current_agency_id() + is_agency_manager()) has full control
-- over every group in their agency. A staff member can only see groups they
-- facilitate (via group_staff) — mirrors "staff see their own caseload, not
-- the whole agency" elsewhere in this schema.
--
-- Tables are all created up front, before any policy — group_staff's own
-- table has to exist before it can be referenced from a policy on `groups`.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.groups (
  id          uuid        primary key default gen_random_uuid(),
  agency_id   uuid        not null references public.agencies(id) on delete cascade,
  name        text        not null,
  description text,
  created_by  uuid        not null references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index groups_agency_id_idx on public.groups (agency_id);

-- ── group_members ──────────────────────────────────────────────────────────
create table public.group_members (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups(id) on delete cascade,
  client_id  uuid        references auth.users(id) on delete cascade,
  stub_id    uuid        references public.client_stubs(id) on delete cascade,
  added_at   timestamptz not null default now(),
  constraint group_members_exactly_one_target
    check ((client_id is not null) <> (stub_id is not null))
);

create unique index group_members_group_client_uidx
  on public.group_members (group_id, client_id) where client_id is not null;
create unique index group_members_group_stub_uidx
  on public.group_members (group_id, stub_id) where stub_id is not null;
create index group_members_client_idx on public.group_members (client_id);
create index group_members_stub_idx on public.group_members (stub_id);

-- ── group_staff ─────────────────────────────────────────────────────────────
create table public.group_staff (
  id         uuid        primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  unique (group_id, user_id)
);

create index group_staff_group_idx on public.group_staff (group_id);
create index group_staff_user_idx on public.group_staff (user_id);

-- ── RLS: groups ───────────────────────────────────────────────────────────
alter table public.groups enable row level security;

create policy "managers manage agency groups" on public.groups
  for all to authenticated
  using (agency_id = public.current_agency_id() and public.is_agency_manager())
  with check (agency_id = public.current_agency_id() and public.is_agency_manager());

create policy "staff read groups they facilitate" on public.groups
  for select to authenticated
  using (exists (
    select 1 from public.group_staff gs
    where gs.group_id = groups.id and gs.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.groups to authenticated;

-- ── RLS: group_members ───────────────────────────────────────────────────
alter table public.group_members enable row level security;

create policy "managers manage agency group members" on public.group_members
  for all to authenticated
  using (exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.agency_id = public.current_agency_id()
      and public.is_agency_manager()
  ))
  with check (exists (
    select 1 from public.groups g
    where g.id = group_members.group_id
      and g.agency_id = public.current_agency_id()
      and public.is_agency_manager()
  ));

create policy "staff read members of groups they facilitate" on public.group_members
  for select to authenticated
  using (exists (
    select 1 from public.group_staff gs
    where gs.group_id = group_members.group_id and gs.user_id = auth.uid()
  ));

-- A client can see their own group memberships (which group(s) they're in),
-- needed for the "my groups" summary on their own page.
create policy "client reads own group memberships" on public.group_members
  for select to authenticated
  using (client_id = auth.uid());

grant select, insert, update, delete on public.group_members to authenticated;

-- ── RLS: group_staff ─────────────────────────────────────────────────────
alter table public.group_staff enable row level security;

create policy "managers manage agency group staff" on public.group_staff
  for all to authenticated
  using (exists (
    select 1 from public.groups g
    where g.id = group_staff.group_id
      and g.agency_id = public.current_agency_id()
      and public.is_agency_manager()
  ))
  with check (exists (
    select 1 from public.groups g
    where g.id = group_staff.group_id
      and g.agency_id = public.current_agency_id()
      and public.is_agency_manager()
  ));

create policy "staff read own group facilitation rows" on public.group_staff
  for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.group_staff to authenticated;

notify pgrst, 'reload schema';
