-- Supabase linter: anon_security_definer_function_executable, 43 findings.
-- PostgREST exposes every function in `public` as a callable RPC endpoint
-- by default, and SECURITY DEFINER functions run with the function
-- owner's privileges rather than the caller's — so being anon-executable
-- matters even when a function checks auth.uid() internally (anon simply
-- gets auth.uid() = null and the check no-ops), because it still means
-- anyone, logged in or not, can attempt the call at all. Went through each
-- of the 43 individually (bodies pulled via pg_get_functiondef, callers
-- checked in the frontend) rather than blanket-revoking, since a few
-- genuinely need anon:
--
--   - check_demo_access, validate_platform_access_token: called before the
--     user has any session at all (demo landing page, pre-signup token
--     check) — left untouched.
--
-- Three categories get anon revoked here:
--
-- 1. Pure trigger / event-trigger / cron-only functions — never called
--    directly via .rpc() anywhere in the frontend (confirmed by grep), and
--    a direct call would just error without trigger context (NEW/OLD not
--    defined) or has no per-caller purpose (auto_cancel_unpaid_sessions,
--    send_admin_session_reminders are scheduled jobs, not user actions).
--    Revoked from `authenticated` too — nothing legitimate ever calls
--    these directly, by any role.
--
-- 2. auth.uid()-scoped action/lookup functions (delete_own_account,
--    request_manual_payment, get_my_role, is_admin, etc) — safe
--    internally, but anon has no legitimate reason to call any of them.
--    Revoked from `anon` only; `authenticated` keeps access since the
--    frontend calls several of these directly, and some (is_admin,
--    questionnaire_admin_id, etc) are also used as helper predicates
--    inside other tables' RLS policies, which still need to evaluate them
--    as the querying (authenticated) role.
--
-- 2b. get_availability_for_date / is_within_availability /
--    get_practice_busy_slots take an admin_id parameter with no internal
--    ownership check, which is fine for authenticated callers (they only
--    return non-sensitive open/closed time-slot info) but their one caller
--    (ClientRescheduleModal) only renders behind ProtectedRoute — no
--    pre-login booking flow exists in this app today, so anon is revoked
--    here too rather than left open on the assumption of a future public
--    booking widget that doesn't exist yet.
--
-- merge_stub_into_client is deliberately absent from this list — it was
-- fixed properly in 20260826000011 (auth.uid() check added to the function
-- body itself, not just a grant change), including its own anon revoke.

-- ── 1. Trigger / event-trigger / cron-only: revoke from anon AND authenticated ──
revoke execute on function public.cascade_block_payment() from anon, authenticated;
revoke execute on function public.cascade_stub_block_payment() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.log_audit_event() from anon, authenticated;
revoke execute on function public.log_session_insert_event() from anon, authenticated;
revoke execute on function public.log_session_update_event() from anon, authenticated;
revoke execute on function public.log_table_change() from anon, authenticated;
revoke execute on function public.notify_admin_client_consented() from anon, authenticated;
revoke execute on function public.notify_admin_email_sent() from anon, authenticated;
revoke execute on function public.notify_admin_manual_payment_pending() from anon, authenticated;
revoke execute on function public.notify_client_assigned_form() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.seed_admin_default_forms() from anon, authenticated;
revoke execute on function public.trigger_google_calendar_sync() from anon, authenticated;
revoke execute on function public.auto_cancel_unpaid_sessions() from anon, authenticated;
revoke execute on function public.send_admin_session_reminders() from anon, authenticated;

-- ── 2. auth.uid()-scoped functions: revoke from anon only ──
revoke execute on function public.consume_platform_access_token(text) from anon;
revoke execute on function public.delete_own_account() from anon;
revoke execute on function public.delete_user_by_id(uuid) from anon;
revoke execute on function public.get_google_calendar_status() from anon;
revoke execute on function public.get_my_admin_consent_settings() from anon;
revoke execute on function public.get_my_is_demo() from anon;
revoke execute on function public.get_my_is_paused() from anon;
revoke execute on function public.get_my_reschedule_cutoff_hours() from anon;
revoke execute on function public.get_my_role() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_superadmin() from anon;
revoke execute on function public.merge_stub_to_user(uuid, uuid) from anon;
revoke execute on function public.questionnaire_admin_id(uuid) from anon;
revoke execute on function public.questionnaire_is_demo(uuid) from anon;
revoke execute on function public.questionnaire_is_system_default(uuid) from anon;
revoke execute on function public.record_client_view(text, uuid) from anon;
revoke execute on function public.request_manual_payment(uuid) from anon;
revoke execute on function public.reset_form_to_default(uuid) from anon;
revoke execute on function public.respond_manual_payment(uuid, boolean) from anon;
revoke execute on function public.set_google_calendar_sync_enabled(boolean) from anon;

-- ── 2b. No pre-login booking flow exists today: revoke from anon ──
revoke execute on function public.get_availability_for_date(uuid, date) from anon;
revoke execute on function public.is_within_availability(uuid, timestamptz, integer) from anon;
revoke execute on function public.get_practice_busy_slots(uuid) from anon;
