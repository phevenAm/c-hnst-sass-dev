-- Admin-defined pricing/duration presets ("packages") that the session
-- creation form can offer as a dropdown, instead of the admin retyping the
-- same price and duration every time. This is deliberately Clarity-side only
-- — it does not sync to Stripe Products/Prices. Stripe never needs to know
-- about a practice's package list; a package here just prefills the two
-- fields CreateSessionModal already sends per-session (price_pence,
-- duration_minutes).
create table public.session_packages (
  id                uuid         default gen_random_uuid() primary key,
  admin_id          uuid         not null references public.users(id) on delete cascade,
  name              text         not null,
  price_pence       integer      not null default 0,
  duration_minutes  integer      not null default 50,
  description       text,
  sort_order        integer      not null default 0,
  archived          boolean      not null default false,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

alter table public.session_packages enable row level security;

-- Admin-only, same shape as payments (20260810000002) — packages are a
-- practice's own pricing config, no client ever reads this table directly.
create policy "admin manages own session_packages"
  on public.session_packages
  for all
  to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

create index session_packages_admin_id_idx on public.session_packages (admin_id, sort_order);

notify pgrst, 'reload schema';
