-- ─────────────────────────────────────────────────────────────────────────────
-- Client-initiated cancellations are never immediate. Clicking "Cancel" on the
-- client side now submits a request here instead of calling cancel-session
-- directly; the admin reviews it and, on accept, cancels the session through
-- the existing admin CancelSessionModal (which already asks about a refund).
-- Mirrors reschedule_requests.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.cancellation_requests (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references public.sessions(id) on delete cascade,
  client_id    uuid        not null references auth.users(id) on delete cascade,
  message      text,
  status       text        not null default 'pending'
                           check (status in ('pending', 'accepted', 'rejected')),
  created_at   timestamptz not null default now()
);

alter table public.cancellation_requests enable row level security;

create policy "clients insert own cancellation requests"
  on public.cancellation_requests for insert
  with check (client_id = auth.uid());

create policy "clients view own cancellation requests"
  on public.cancellation_requests for select
  using (client_id = auth.uid());

create policy "admins manage own cancellation requests"
  on public.cancellation_requests for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = cancellation_requests.session_id and s.created_by = auth.uid()
    )
  );

create index cancellation_requests_session_idx on public.cancellation_requests (session_id);
