-- Supabase database linter cleanup (2026-09-07).
--
-- Two findings, both re-introduced by migrations added after the
-- 2026-08-26 security audit (20260826000013):
--
--   1. anon_security_definer_function_executable (0028) — ~40 SECURITY
--      DEFINER functions in `public` are callable by the `anon` role.
--      Same root cause the earlier audit documented: Postgres grants
--      EXECUTE to the PUBLIC pseudo-role on every newly-created function
--      unless it's explicitly revoked, and `anon` inherits through that
--      PUBLIC grant. The newer migrations tried to `revoke ... from anon,
--      authenticated` — which is a no-op, because the grant lives on
--      PUBLIC, not on the `anon` role. The fix is to revoke from PUBLIC
--      (and, for the pure trigger/cron helpers, from `authenticated`
--      too). `authenticated` holds its own explicit EXECUTE grant on
--      every RPC below, so revoking PUBLIC does not affect signed-in
--      callers — verified against pg_proc.proacl.
--
--      Safe for `anon`: the only policies that grant `anon` are the two
--      on `public.platform_access_token`, and none of the functions
--      below appear in an anon/PUBLIC RLS policy. The three genuine
--      pre-login RPCs — validate_platform_access_token,
--      check_demo_access, validate_agency_invite — are deliberately left
--      callable by `anon` (the 0028 warning on those is expected).
--
--   2. function_search_path_mutable (0011) — two trigger helpers have no
--      search_path pinned. Neither is SECURITY DEFINER, so the exposure
--      is minor, but pin them to `public` for determinism (matches the
--      convention used elsewhere in these migrations).
--
-- The `extension_in_public` finding for pg_net is intentionally NOT
-- addressed here — moving it breaks the cron jobs that call it until
-- they're re-pointed, and that needs a maintenance window.

-- ── 1a. Trigger / cron-only helpers: revoke from PUBLIC + authenticated ──
-- No client role should ever call these directly; they run as the table
-- owner from a trigger or as postgres from pg_cron.
revoke execute on function public.allocate_agency_invoice_number() from public, anon, authenticated;
revoke execute on function public.allocate_invoice_number() from public, anon, authenticated;
revoke execute on function public.cascade_agency_codename_policy() from public, anon, authenticated;
revoke execute on function public.check_scheduled_jobs_health() from public, anon, authenticated;
revoke execute on function public.check_session_overlap() from public, anon, authenticated;
revoke execute on function public.check_stub_session_overlap() from public, anon, authenticated;
revoke execute on function public.enforce_agency_codename_policy() from public, anon, authenticated;
revoke execute on function public.enforce_agency_staff_limit() from public, anon, authenticated;
revoke execute on function public.enforce_client_active_limit() from public, anon, authenticated;
revoke execute on function public.enforce_client_archived_limit() from public, anon, authenticated;
revoke execute on function public.notify_admin_risk_response() from public, anon, authenticated;
revoke execute on function public.notify_client_lifecycle(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.recalc_invoice_total() from public, anon, authenticated;
revoke execute on function public.set_rcads_admin_id() from public, anon, authenticated;
revoke execute on function public.sync_user_email() from public, anon, authenticated;
revoke execute on function public.trigger_client_cap_warnings() from public, anon, authenticated;
revoke execute on function public.trigger_client_session_reminders() from public, anon, authenticated;
revoke execute on function public.trigger_microsoft_calendar_sync() from public, anon, authenticated;

-- ── 1b. auth.uid()-scoped RPCs / RLS helpers: revoke from PUBLIC + anon ──
-- `authenticated` keeps its own explicit grant, so signed-in callers and
-- RLS policy evaluation are unaffected.
revoke execute on function public.active_client_count(uuid) from public, anon;
revoke execute on function public.active_staff_count(uuid) from public, anon;
revoke execute on function public.acts_for_admin(uuid) from public, anon;
revoke execute on function public.admin_archive_client(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_unarchive_client(uuid) from public, anon;
revoke execute on function public.agency_finance_summary(date, date) from public, anon;
revoke execute on function public.agency_plan_change_check(text) from public, anon;
revoke execute on function public.anonymise_client(uuid) from public, anon;
revoke execute on function public.archived_client_count(uuid) from public, anon;
revoke execute on function public.bump_agency_agreement_version() from public, anon;
revoke execute on function public.check_no_duplicate_submission(uuid, uuid) from public, anon;
revoke execute on function public.consume_agency_invite(text, boolean, text) from public, anon;
revoke execute on function public.current_agency_id() from public, anon;
revoke execute on function public.get_microsoft_calendar_status() from public, anon;
revoke execute on function public.get_my_admin_consent_settings() from public, anon;
revoke execute on function public.is_agency_manager() from public, anon;
revoke execute on function public.mark_agency_invoice_paid(uuid, timestamptz) from public, anon;
revoke execute on function public.mark_invoice_paid(uuid, timestamptz) from public, anon;
revoke execute on function public.plan_change_check(text) from public, anon;
revoke execute on function public.respond_to_agency_assignment(uuid, boolean, text) from public, anon;
revoke execute on function public.seed_admin_default_checkin(uuid) from public, anon;
revoke execute on function public.seed_admin_feedback_form(uuid) from public, anon;
revoke execute on function public.set_microsoft_calendar_sync_enabled(boolean) from public, anon;
revoke execute on function public.set_microsoft_teams_links_enabled(boolean) from public, anon;

-- ── 2. Pin search_path on the two flagged trigger helpers ──
alter function public.block_paused_write() set search_path = public;
alter function public.practice_slot_has_conflict(uuid, timestamptz, integer, uuid, uuid) set search_path = public;

notify pgrst, 'reload schema';
