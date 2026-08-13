-- system_config: a single-row-per-key global config store.
-- Used to expose deployment-time values (e.g. app version) to the client
-- without requiring a separate API call.

create table if not exists public.system_config (
  key        text primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.system_config enable row level security;

-- Any authenticated user can read (needed for the version check on sign-in).
create policy "authenticated users can read system_config"
  on public.system_config for select
  to authenticated
  using (true);

-- Only service-role (migrations / edge functions) can write — no client writes.

-- Seed the current app version. Subsequent deploys run a new migration to bump it.
insert into public.system_config (key, value)
values ('app_version', '3.5.0')
on conflict (key) do update set value = excluded.value, updated_at = now();
