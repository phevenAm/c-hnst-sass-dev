-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5.4 — Client journalling + resource favouriting
--
-- journal_entries (todo a167d7dd)
--   Private per-client entries. Strict RLS: users see only their own rows.
--   Encrypted client-side (same AES-256-GCM approach as session_notes) — the
--   `content` column stores the ciphertext + IV envelope as text.
--
-- resource_favourites (todo 0f26ec01)
--   Clients can heart resources. Simple join table with unique constraint.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── journal_entries ──────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references public.users(id) on delete cascade,
  content     text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

-- Clients can only access their own entries. No admin access by design —
-- journal is explicitly private from the therapist.
drop policy if exists "client owns own journal" on public.journal_entries;
create policy "client owns own journal"
  on public.journal_entries
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $func$
begin
  new.updated_at = now();
  return new;
end;
$func$;

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

-- ── resource_favourites ──────────────────────────────────────────────────────
create table if not exists public.resource_favourites (
  user_id     uuid not null references public.users(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, resource_id)
);

alter table public.resource_favourites enable row level security;

drop policy if exists "client manages own favourites" on public.resource_favourites;
create policy "client manages own favourites"
  on public.resource_favourites
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
