-- Supabase linter: function_search_path_mutable, 18 functions in public.
-- None of these had `search_path` pinned, which means each one resolves
-- unqualified table/function names (e.g. `users`, `sessions`) against
-- whatever search_path was active at CALL time rather than a fixed one —
-- exploitable if an attacker can get an object of the same name created
-- earlier in some other schema on the search path (schema-hijacking). This
-- risk is sharpest for the SECURITY DEFINER functions here (they run with
-- the function owner's privileges, not the caller's), but the linter
-- (correctly) flags all of them since even non-SECURITY-DEFINER functions
-- can be hijacked in some call contexts.
--
-- Fix is non-invasive: pin search_path via ALTER FUNCTION rather than
-- touching any function body. Every one of these already assumes `public`
-- for its unqualified references (they're public-schema functions written
-- against public-schema tables), so `search_path = public` locks in the
-- behavior they already had, rather than changing it.

alter function public.block_demo_write() set search_path = public;
alter function public.block_paused_write() set search_path = public;
alter function public.check_no_duplicate_submission(p_user_id uuid, p_questionnaire_id uuid) set search_path = public;
alter function public.check_session_completed() set search_path = public;
alter function public.check_session_overlap() set search_path = public;
alter function public.delete_own_account() set search_path = public;
alter function public.delete_user_by_id(target_user_id uuid) set search_path = public;
alter function public.generate_referral_code() set search_path = public;
alter function public.get_my_role() set search_path = public;
alter function public.log_audit_event() set search_path = public;
alter function public.log_session_insert_event() set search_path = public;
alter function public.log_session_update_event() set search_path = public;
alter function public.questionnaire_admin_id(q_id uuid) set search_path = public;
alter function public.questionnaire_is_demo(q_id uuid) set search_path = public;
alter function public.set_rcads_admin_id() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.stamp_token_admin_id() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
