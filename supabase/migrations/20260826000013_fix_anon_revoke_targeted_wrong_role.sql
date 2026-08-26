-- 20260826000012's `revoke ... from anon` statements didn't actually do
-- anything: verified live that is_admin() and delete_own_account() were
-- still callable by anon after that migration ran. Checked why —
-- pg_proc.proacl showed `{=X/postgres, ...}`, an EXECUTE grant to the
-- PUBLIC pseudo-role (Postgres's default for newly created functions
-- unless explicitly revoked at creation time). `anon` was never granted
-- EXECUTE directly; it was inheriting through that PUBLIC grant the whole
-- time, so revoking from the `anon` role specifically removed a grant that
-- didn't exist and left the actual PUBLIC grant untouched.
--
-- The fix is to revoke from PUBLIC. `authenticated` already holds its own
-- separate, explicit EXECUTE grant on these functions (visible in the same
-- proacl), so revoking PUBLIC does not touch that — authenticated callers
-- are unaffected, only anon (and any other role with no explicit grant of
-- its own) loses access. For the pure trigger/cron functions where
-- authenticated should ALSO lose access, authenticated is revoked
-- explicitly alongside PUBLIC, same as the previous migration intended.

-- ── 1. Trigger / event-trigger / cron-only: PUBLIC and authenticated both ──
revoke execute on function public.cascade_block_payment() from public, authenticated;
revoke execute on function public.cascade_stub_block_payment() from public, authenticated;
revoke execute on function public.handle_new_user() from public, authenticated;
revoke execute on function public.log_audit_event() from public, authenticated;
revoke execute on function public.log_session_insert_event() from public, authenticated;
revoke execute on function public.log_session_update_event() from public, authenticated;
revoke execute on function public.log_table_change() from public, authenticated;
revoke execute on function public.notify_admin_client_consented() from public, authenticated;
revoke execute on function public.notify_admin_email_sent() from public, authenticated;
revoke execute on function public.notify_admin_manual_payment_pending() from public, authenticated;
revoke execute on function public.notify_client_assigned_form() from public, authenticated;
revoke execute on function public.rls_auto_enable() from public, authenticated;
revoke execute on function public.seed_admin_default_forms() from public, authenticated;
revoke execute on function public.trigger_google_calendar_sync() from public, authenticated;
revoke execute on function public.auto_cancel_unpaid_sessions() from public, authenticated;
revoke execute on function public.send_admin_session_reminders() from public, authenticated;

-- ── 2. auth.uid()-scoped functions: PUBLIC only (authenticated keeps its own grant) ──
revoke execute on function public.consume_platform_access_token(text) from public;
revoke execute on function public.delete_own_account() from public;
revoke execute on function public.delete_user_by_id(uuid) from public;
revoke execute on function public.get_google_calendar_status() from public;
revoke execute on function public.get_my_admin_consent_settings() from public;
revoke execute on function public.get_my_is_demo() from public;
revoke execute on function public.get_my_is_paused() from public;
revoke execute on function public.get_my_reschedule_cutoff_hours() from public;
revoke execute on function public.get_my_role() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_superadmin() from public;
revoke execute on function public.merge_stub_to_user(uuid, uuid) from public;
revoke execute on function public.questionnaire_admin_id(uuid) from public;
revoke execute on function public.questionnaire_is_demo(uuid) from public;
revoke execute on function public.questionnaire_is_system_default(uuid) from public;
revoke execute on function public.record_client_view(text, uuid) from public;
revoke execute on function public.request_manual_payment(uuid) from public;
revoke execute on function public.reset_form_to_default(uuid) from public;
revoke execute on function public.respond_manual_payment(uuid, boolean) from public;
revoke execute on function public.set_google_calendar_sync_enabled(boolean) from public;

-- ── 2b. No pre-login booking flow exists today: PUBLIC only ──
revoke execute on function public.get_availability_for_date(uuid, date) from public;
revoke execute on function public.is_within_availability(uuid, timestamptz, integer) from public;
revoke execute on function public.get_practice_busy_slots(uuid) from public;

-- merge_stub_into_client's PUBLIC grant was already handled by its own fix
-- in 20260826000011 (`revoke ... from anon`) — same PUBLIC-vs-anon gap
-- applies there too, so close it here for consistency.
revoke execute on function public.merge_stub_into_client(uuid, uuid) from public;
