-- ─────────────────────────────────────────────────────────────────────────────
-- Refunds are never automatic. When cancel-session decides a Stripe-paid
-- session qualifies for a refund (cancelled outside the practice's cutoff
-- window), it creates a pending row here and notifies the admin — the admin
-- has to explicitly approve before any money moves, via respond-refund-request.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  admin_id uuid not null references public.users(id) on delete cascade,
  client_id uuid references public.users(id) on delete set null,
  stripe_payment_intent_id text not null,
  amount_pence integer not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id)
);

alter table public.refund_requests enable row level security;

-- Admin can see their own queue directly; approving/declining goes through
-- respond-refund-request (service role — issuing the actual Stripe refund
-- needs the secret key, which only lives server-side).
create policy "admin views own refund requests"
  on public.refund_requests
  for select
  using (admin_id = auth.uid());

create index if not exists refund_requests_admin_pending_idx
  on public.refund_requests (admin_id)
  where status = 'pending';
