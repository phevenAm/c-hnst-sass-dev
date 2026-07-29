-- Availability overrides: one-off exceptions to the recurring availability_rules
-- template, tied to a specific calendar date.
--
--   is_blocked = true   → remove availability on this date (holiday / vacation mode).
--                         Times optional: null times block the whole day; supplied
--                         times block just that portion of the day.
--   is_blocked = false  → add an extra one-off window on this date (start/end required),
--                         even on a day the recurring template does not normally cover.
create table if not exists public.availability_overrides (
  id            uuid        primary key default gen_random_uuid(),
  admin_id      uuid        not null references auth.users(id) on delete cascade,
  override_date date        not null,
  start_time    time,
  end_time      time,
  is_blocked    boolean     not null default false,
  label         text,
  created_at    timestamptz not null default now(),
  -- an added window must have both times; a block may omit them (whole day)
  check (is_blocked or (start_time is not null and end_time is not null)),
  -- when both times are present they must be ordered
  check (start_time is null or end_time is null or end_time > start_time)
);

create index if not exists availability_overrides_admin_date_idx
  on public.availability_overrides (admin_id, override_date);

alter table public.availability_overrides enable row level security;

-- Admin owns and manages their own overrides.
drop policy if exists "admins manage own availability overrides" on public.availability_overrides;
create policy "admins manage own availability overrides"
  on public.availability_overrides for all
  using (admin_id = auth.uid());

-- Clients may read their own admin's overrides (to render the reschedule picker).
drop policy if exists "clients view their admin availability overrides" on public.availability_overrides;
create policy "clients view their admin availability overrides"
  on public.availability_overrides for select
  using (
    admin_id = (
      select u.admin_id from public.users u where u.id = auth.uid()
    )
  );
