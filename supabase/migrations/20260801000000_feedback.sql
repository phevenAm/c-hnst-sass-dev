-- Feedback / feature-request inbox.
-- Admins (counsellors) submit bug reports + feature ideas from a footer widget;
-- the platform owner reviews them in /superadmin. Reuses public.is_superadmin()
-- (security-definer, from 20260729000000_fix_superadmin_rls.sql) for owner access.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  submitter_id uuid references public.users (id) on delete set null,
  type text not null check (type in ('bug', 'feature')),
  message text not null check (char_length(message) between 1 and 4000),
  page text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'done')),
  created_at timestamptz not null default now()
);

comment on table public.feedback is
  'Bug reports + feature requests from practice admins. Reviewed by the platform owner in /superadmin.';

create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Submit: any authenticated user may insert a row attributed to themselves.
drop policy if exists "users insert own feedback" on public.feedback;
create policy "users insert own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (submitter_id = auth.uid());

-- Read: submitters can see their own; the platform owner sees everything.
drop policy if exists "read own or superadmin all feedback" on public.feedback;
create policy "read own or superadmin all feedback"
  on public.feedback
  for select
  to authenticated
  using (submitter_id = auth.uid() or public.is_superadmin());

-- Triage: only the platform owner can change status / delete.
drop policy if exists "superadmin update feedback" on public.feedback;
create policy "superadmin update feedback"
  on public.feedback
  for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "superadmin delete feedback" on public.feedback;
create policy "superadmin delete feedback"
  on public.feedback
  for delete
  to authenticated
  using (public.is_superadmin());
