-- ─────────────────────────────────────────────────────────────────────────────
-- Client lifecycle: ARCHIVE (deactivate) as a first-class state, distinct from
-- both "pause" (temporary, `users.disabled`) and "erase" (row deleted).
--
-- Motivation: today a client hitting "delete my account" runs delete_own_account(),
-- which hard-deletes public.users + auth.users. That cascades away check-in
-- responses / RCADS / requests, orphans sessions & payments (client_id -> NULL),
-- and lets a client unilaterally destroy the counsellor's clinical & outcome
-- history — which the counsellor has professional/legal retention obligations to
-- keep. There is no way to end a working relationship while retaining an accurate,
-- attributable business record.
--
-- This migration adds the columns + two helpers:
--   * generate_client_codename() — stable pseudonymous label for a scrubbed client
--   * anonymise_client(uuid)      — scrubs PII on public.users + auth.users,
--                                   assigns a codename if none, stamps anonymised_at
--
-- The archive/unarchive RPCs and the delete_own_account() rewrite live in the
-- two follow-up migrations (…0001, …0002).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists archived_at     timestamptz,
  add column if not exists archived_reason text,
  add column if not exists anonymised_at   timestamptz;

-- Stubs can be archived too (relationship ended, keep the record) rather than
-- only hard-deleted, which cascades their notes + stub_sessions away.
alter table public.client_stubs
  add column if not exists archived_at timestamptz;

-- Partial index: the common query is "active clients for this practice".
create index if not exists users_active_by_admin_idx
  on public.users (admin_id)
  where archived_at is null and deleted_at is null;

-- ── generate_client_codename() ─────────────────────────────────────────────
-- Short, human-readable, non-identifying. Not guaranteed unique, but collisions
-- are cosmetic (two "Client 3F9A" under one practice) and vanishingly unlikely.
create or replace function public.generate_client_codename()
returns text
language sql
volatile
set search_path = public
as $func$
  select 'Client ' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
$func$;

-- ── anonymise_client(p_user_id) ────────────────────────────────────────────
-- Scrubs identifying data while KEEPING the row (and therefore every
-- session/payment/response FK that points at it) intact. Irreversible.
--
-- Authorisation: the client themselves (auth.uid() = p_user_id) OR the admin
-- who owns them (users.admin_id = auth.uid()). SECURITY DEFINER so it can
-- touch auth.users; callers are still gated by the check below.
create or replace function public.anonymise_client(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if v_caller <> p_user_id
     and not exists (
       select 1 from public.users
       where id = p_user_id and admin_id = v_caller
     )
  then
    raise exception 'Not authorised to anonymise this client';
  end if;

  -- public.users: drop every free-text / identifying field, keep a codename
  update public.users
  set first_name         = null,
      last_name          = null,
      display_name        = null,
      avatar_url          = null,
      age                 = null,
      dob                 = null,
      focus_keywords      = null,
      consent_signed_name = null,
      admin_codename      = coalesce(admin_codename, public.generate_client_codename()),
      anonymised_at       = coalesce(anonymised_at, now())
  where id = p_user_id;

  -- auth.users: the email address is PII and must not survive an erasure
  -- request. Replace with a per-user sentinel (unique, non-deliverable) and
  -- clear the user-supplied metadata blob.
  update auth.users
  set email              = 'former-client+' || p_user_id::text || '@deleted.invalid',
      raw_user_meta_data = '{}'::jsonb,
      phone              = null
  where id = p_user_id;
end;
$func$;

revoke execute on function public.generate_client_codename() from anon;
revoke execute on function public.anonymise_client(uuid) from anon;
grant  execute on function public.anonymise_client(uuid) to authenticated;
