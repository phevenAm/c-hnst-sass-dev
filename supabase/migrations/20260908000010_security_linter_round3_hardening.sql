-- Supabase database linter cleanup, round 3 — targeted hardening (2026-09-08).
--
-- Follows 20260908000000. None of these are live holes; they close latent
-- surface and clear two more 0029 findings.
--
--   1. pg_net — net.http_post / http_get / http_delete carry a PUBLIC
--      EXECUTE grant that `anon` / `authenticated` inherit. This CANNOT be
--      revoked from a migration: net.* is owned by `supabase_admin` and the
--      grant was made by `supabase_admin`; `postgres` (the migration role)
--      is not a member and can only revoke grants it made itself, so the
--      statement is a silent no-op. Left here as documentation.
--      Real-world exposure today is nil — the `net` schema is not exposed
--      through PostgREST (that's why the linter never flagged these), and
--      every in-app caller is a postgres-owned SECURITY DEFINER function
--      with a hard-coded URL. To actually strip the grant, Supabase support
--      must run it as supabase_admin.
--
--   2. seed_admin_default_checkin / seed_admin_feedback_form take an
--      arbitrary admin_id with no caller check. They are only ever called
--      via `perform` from postgres-owned SECURITY DEFINER onboarding
--      triggers, never from the frontend, so `authenticated` does not need
--      EXECUTE. Removing it also stops a signed-in user seeding a
--      (fixed-content) check-in form under another practice.
--
--   3. agency_member_settlement(uuid) had no agency scoping — any signed-in
--      user who knew a member's UUID could read that member's settlement
--      direction. Scope the resolver to the caller's own agency. The only
--      caller, agency_settlement_overview(), already restricts to
--      current_agency_id(), so behaviour there is unchanged.

-- ── 1. pg_net: no-op on hosted Supabase (see header) — kept for the record.
--     Postgres emits "no privileges could be revoked" warnings and moves on.
revoke execute on all functions in schema net from anon, authenticated, public;

-- ── 2. Onboarding seed helpers: trigger-only, revoke from client roles ──
revoke execute on function public.seed_admin_default_checkin(uuid) from public, anon, authenticated;
revoke execute on function public.seed_admin_feedback_form(uuid)  from public, anon, authenticated;

-- ── 3. agency_member_settlement: scope to the caller's own agency ──
create or replace function public.agency_member_settlement(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $func$
  select coalesce(
    am.settlement_direction,
    nullif(ag.default_settlement_direction, 'auto'),
    case am.employment_type
      when 'employee' then 'agency_pays_staff'
      else 'staff_pays_agency'
    end
  )
  from public.agency_members am
  join public.agencies ag on ag.id = am.agency_id
  where am.user_id = p_user
    and am.status = 'active'
    and am.agency_id = public.current_agency_id();
$func$;

revoke execute on function public.agency_member_settlement(uuid) from public, anon;
grant  execute on function public.agency_member_settlement(uuid) to authenticated;

notify pgrst, 'reload schema';
