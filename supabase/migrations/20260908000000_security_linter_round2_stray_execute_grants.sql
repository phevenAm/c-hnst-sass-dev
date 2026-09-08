-- Supabase database linter cleanup, round 2 (2026-09-08).
--
-- Follows 20260907000000, which revoked the PUBLIC/anon EXECUTE grant from
-- ~40 SECURITY DEFINER functions. Two gaps remained, both re-introduced by
-- migrations added afterwards (20260905000001, 20260907000032/33):
--
--   * function_search_path / 0028 (anon can execute) — the agency
--     settlement + activity-log helpers were created with the default
--     PUBLIC EXECUTE grant still in place; their migrations revoked from
--     `anon` (a no-op — the grant lives on PUBLIC, which `anon` inherits
--     through) but not from PUBLIC itself.
--
--   * 0029 (authenticated can execute) — the six agency trigger / helper
--     functions below carry an EXECUTE grant no caller needs. Trigger
--     functions run from the trigger machinery regardless of ACL, and the
--     two internal helpers are only ever called from other SECURITY
--     DEFINER functions (which run as the owner). Revoking EXECUTE from
--     every client role is therefore safe and clears both 0028 and 0029.
--
-- NOT touched (deliberate, documented exceptions — see the round-2 triage):
--   * validate_platform_access_token / check_demo_access /
--     validate_agency_invite — genuine pre-login RPCs, must stay anon.
--   * every other SECURITY DEFINER RPC the frontend calls, and the RLS
--     helper functions used inside policies — `authenticated` must keep
--     EXECUTE or the app / RLS evaluation breaks. 0029 has no suppression
--     mechanism; these warnings are expected.
--   * extension_in_public (pg_net) — non-relocatable, Supabase-managed;
--     needs a drop/recreate in a maintenance window.

-- ── 1. Trigger-only functions: no client role should hold EXECUTE ──
revoke execute on function public.bump_agency_agreement_version()   from public, anon, authenticated;
revoke execute on function public.trg_agency_assignment_activity()  from public, anon, authenticated;
revoke execute on function public.trg_agency_intake_activity()      from public, anon, authenticated;
revoke execute on function public.trg_agency_invoice_activity()     from public, anon, authenticated;
revoke execute on function public.trg_agency_members_activity()     from public, anon, authenticated;
revoke execute on function public.trg_agency_policy_activity()      from public, anon, authenticated;

-- ── 2. Internal helpers, only called from other SECURITY DEFINER code ──
revoke execute on function public._person_name(uuid) from public, anon, authenticated;
revoke execute on function public.log_agency_event(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;

-- ── 3. Stray PUBLIC grant leaking to anon; `authenticated` kept (the
--       creating migrations granted it explicitly and on purpose) ──
revoke execute on function public.agency_member_settlement(uuid)                     from public, anon;
revoke execute on function public.agency_settlement_overview()                       from public, anon;
revoke execute on function public.mark_agency_invoice_paid(uuid, timestamptz, text)  from public, anon;

notify pgrst, 'reload schema';
