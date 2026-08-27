-- Practice documents: PDF housekeeping material an admin shares with clients
-- (working agreement, house rules, privacy notice…). Replaces the awkward
-- "onboarding" form_type on questionnaires — a contract was never a
-- questionnaire. All documents are reference-only for the client; the admin
-- marks at most ONE as requires_signature, and that one drives the existing
-- client-consent gate (see 20260827000002 for the rewire + backfill).

-- ── practice_documents ────────────────────────────────────────────────────────

create table if not exists public.practice_documents (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid not null default auth.uid()
                       references public.users(id) on delete cascade,
  title              text not null,
  description        text,
  -- Optional: an onboarding "form" could carry only a title (the PDF field
  -- was always optional), so a migrated document may have no PDF either.
  pdf_url            text,
  requires_signature boolean not null default false,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- At most one signature-required document per practice.
create unique index if not exists practice_documents_one_signature_per_admin
  on public.practice_documents (admin_id)
  where requires_signature;

create index if not exists practice_documents_admin_id_idx
  on public.practice_documents (admin_id);

alter table public.practice_documents enable row level security;

drop policy if exists "admins manage own practice_documents" on public.practice_documents;
create policy "admins manage own practice_documents"
  on public.practice_documents for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

drop policy if exists "clients view active practice_documents" on public.practice_documents;
create policy "clients view active practice_documents"
  on public.practice_documents for select
  using (
    is_active = true
    and admin_id = (select u.admin_id from public.users u where u.id = auth.uid())
  );

-- ── document_signatures ──────────────────────────────────────────────────────

create table if not exists public.document_signatures (
  document_id uuid not null references public.practice_documents(id) on delete cascade,
  user_id     uuid not null default auth.uid()
                references public.users(id) on delete cascade,
  signed_name text not null,
  signed_at   timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index if not exists document_signatures_user_id_idx
  on public.document_signatures (user_id);

alter table public.document_signatures enable row level security;

drop policy if exists "clients read own signatures" on public.document_signatures;
create policy "clients read own signatures"
  on public.document_signatures for select
  using (user_id = auth.uid());

drop policy if exists "clients insert own signatures" on public.document_signatures;
create policy "clients insert own signatures"
  on public.document_signatures for insert
  with check (user_id = auth.uid());

drop policy if exists "admins read signatures on own documents" on public.document_signatures;
create policy "admins read signatures on own documents"
  on public.document_signatures for select
  using (
    exists (
      select 1 from public.practice_documents d
      where d.id = document_id and d.admin_id = auth.uid()
    )
  );
