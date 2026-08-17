-- Track when an admin last viewed each client profile so the dashboard
-- can show "recently visited" clients.
--
-- client_type: 'user' (real client) | 'stub' (offline client)
-- client_ref:  the UUID of the user or stub row
-- One row per (admin_id, client_type, client_ref) — updated on each visit.

create table public.client_views (
  admin_id    uuid         not null references auth.users(id) on delete cascade,
  client_type text         not null check (client_type in ('user', 'stub')),
  client_ref  uuid         not null,
  viewed_at   timestamptz  not null default now(),
  primary key (admin_id, client_type, client_ref)
);

alter table public.client_views enable row level security;

create policy "admin manages own client views"
  on public.client_views
  for all
  using  (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- RPC to upsert a view (avoids sending admin_id from the client)
create or replace function public.record_client_view(p_type text, p_ref uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.client_views(admin_id, client_type, client_ref, viewed_at)
  values (auth.uid(), p_type, p_ref, now())
  on conflict (admin_id, client_type, client_ref) do update set viewed_at = now();
$$;

notify pgrst, 'reload schema';
