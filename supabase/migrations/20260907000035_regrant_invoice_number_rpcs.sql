-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: 20260907000000_security_linter_anon_execute_and_search_path.sql
-- misclassified two caller-facing RPCs as "trigger / cron-only helpers" and
-- revoked EXECUTE from `authenticated` (its section 1a). Both are actually
-- called straight from the app with a normal user session:
--
--   * allocate_invoice_number()        — InvoiceModal.tsx (a solo admin raising
--                                        a client invoice)
--   * allocate_agency_invoice_number() — agencySlice.ts createAgencyInvoice
--                                        (an agency manager raising a staff invoice)
--
-- With the grant gone every "New invoice" flow fails at number allocation
-- ("permission denied for function …"), so no invoice — client or agency —
-- can be created. Caught by e2e/agency/agency.spec.ts.
--
-- Both are SECURITY DEFINER and self-scope (allocate_invoice_number to
-- auth.uid()'s own practice_settings; allocate_agency_invoice_number guards on
-- current_agency_id() + is_agency_manager()), so `authenticated` is the correct
-- grant — restoring exactly what 20260903000010 / 20260905000002 set.
--
-- recalc_invoice_total() is left revoked on purpose — that one really is
-- trigger-only.
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function public.allocate_invoice_number() to authenticated;
grant execute on function public.allocate_agency_invoice_number() to authenticated;

-- While here: agency_activity_feed() (20260907000033) still carries the default
-- PUBLIC execute grant — its `revoke … from anon` didn't remove the PUBLIC
-- grant that anon inherits (the same gotcha the linter migration fixes for
-- everything else). It self-guards on is_agency_manager(), but keep the
-- surface tight: revoke from PUBLIC, keep it for authenticated.
revoke execute on function public.agency_activity_feed(uuid, timestamptz, timestamptz, integer) from public;
grant  execute on function public.agency_activity_feed(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
