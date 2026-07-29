-- Availability rules: the admin's recurring weekly template of open windows.
-- e.g. "Fridays 12:00–16:00" = one row { day_of_week: 5, start_time: 12:00, end_time: 16:00 }.
-- These are the slots clients may request/reschedule into. The admin can add,
-- edit and delete rules freely; one-off exceptions live in availability_overrides.
--
-- day_of_week matches JS Date.getDay(): 0 = Sunday … 6 = Saturday.
create table if not exists public.availability_rules (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        not null references auth.users(id) on delete cascade,
  day_of_week smallint    not null check (day_of_week between 0 and 6),
  start_time  time        not null,
  end_time    time        not null,
  label       text,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists availability_rules_admin_idx
  on public.availability_rules (admin_id);

alter table public.availability_rules enable row level security;

-- Admin owns and manages their own rules.
drop policy if exists "admins manage own availability rules" on public.availability_rules;
create policy "admins manage own availability rules"
  on public.availability_rules for all
  using (admin_id = auth.uid());

-- Clients may read their own admin's rules (to render the reschedule picker).
drop policy if exists "clients view their admin availability rules" on public.availability_rules;
create policy "clients view their admin availability rules"
  on public.availability_rules for select
  using (
    admin_id = (
      select u.admin_id from public.users u where u.id = auth.uid()
    )
  );
