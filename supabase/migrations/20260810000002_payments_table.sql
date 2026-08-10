-- Manual payment records — for cash, bank transfer, or anything not captured
-- by a session's paid flag. Linked to a real user OR an offline client stub.
create table public.payments (
  id            uuid         default gen_random_uuid() primary key,
  admin_id      uuid         not null default auth.uid() references auth.users(id) on delete cascade,
  client_id     uuid         references public.users(id) on delete set null,
  stub_id       uuid         references public.client_stubs(id) on delete set null,
  amount_pence  integer      not null default 0,
  description   text,
  paid_at       timestamptz  not null default now(),
  created_at    timestamptz  not null default now()
);

alter table public.payments enable row level security;

create policy "admin manages own payments"
  on public.payments
  for all
  using  (admin_id = auth.uid())
  with check (admin_id = auth.uid());

notify pgrst, 'reload schema';
