-- ─────────────────────────────────────────────────────────────────────────────
-- C3 — codify "RLS is enabled on every public table" in version control.
--
-- Production has RLS enabled on all 54 public tables (verified 2026-09-08), but
-- for most of them the ENABLE was done through the Supabase dashboard years ago
-- and never landed in a migration — only session_notes (20260623000000) and
-- payments (20260810000002) enable it in tracked SQL.
--
-- Consequence: a `supabase db reset`, a fresh branch database, or any new
-- environment built purely from migrations comes up with RLS DISABLED on the
-- core tables (users, sessions, responses, questionnaires, resources,
-- practice_settings, questionnaire_assignments, tags, …). The default
-- anon/authenticated table grants Supabase installs are still there, so that
-- state is full, unauthenticated cross-tenant read/write of every practice's
-- data. This migration makes the invariant reproducible.
--
-- Idempotent: `ENABLE ROW LEVEL SECURITY` on an already-enabled table is a
-- no-op, so on production this loop matches nothing. It iterates every regular
-- table in `public`, so tables added between now and a rebuild are covered too.
-- Every one of these tables already has its policies defined in earlier
-- migrations, which run before this one, so there is no deny-all window.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'C3: enabled row level security on public.%', r.relname;
  end loop;
end $$;
