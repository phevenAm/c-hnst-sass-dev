-- admin_todos has been live on the remote database since ~2026-07-20 (created
-- out-of-band, no matching migration ever committed) — Stephen has been using
-- it as a running bug/feature list while testing as an admin. This formalizes
-- the table so local resets and `db push` stay in sync with prod. Schema below
-- matches the live table exactly (pulled via information_schema + pg_constraint).

create table if not exists public.admin_todos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  admin_id     uuid not null references auth.users (id) on delete cascade,
  text         text not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  deadline     timestamptz,
  priority     smallint not null default 2 check (priority = any (array[1, 2, 3]))
);

alter table public.admin_todos enable row level security;

drop policy if exists "admins manage own todos" on public.admin_todos;
create policy "admins manage own todos"
  on public.admin_todos
  for all
  using (
    admin_id = auth.uid()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  )
  with check (
    admin_id = auth.uid()
    and exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );
