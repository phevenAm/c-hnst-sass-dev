-- Admin-only private calendar events (e.g. supervision, admin time, personal
-- appointments). These render on the admin's own scheduler but must NEVER be
-- visible to clients.
--
-- NOTE: we deliberately do NOT reuse availability_overrides for this — that
-- table grants clients a SELECT policy (they read their admin's overrides to
-- render the reschedule picker), so anything stored there leaks its label to
-- clients. This table has no client-facing policy at all, so RLS default-deny
-- keeps every row private to the owning admin.

create table if not exists public.admin_private_events (
  id          uuid        primary key default gen_random_uuid(),
  admin_id    uuid        not null references auth.users(id) on delete cascade,
  title       text        not null check (char_length(title) between 1 and 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  notes       text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists admin_private_events_admin_time_idx
  on public.admin_private_events (admin_id, starts_at);

alter table public.admin_private_events enable row level security;

-- Owning admin has full CRUD over their own private events.
-- There is intentionally no policy for clients — they can never read these.
drop policy if exists "admins manage own private events" on public.admin_private_events;
create policy "admins manage own private events"
  on public.admin_private_events for all
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());
