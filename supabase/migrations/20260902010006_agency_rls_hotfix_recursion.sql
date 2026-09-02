-- HOTFIX for 20260902010003_agency_manager_rls.sql.
--
-- The manager-visibility policies added to the questionnaire family
-- (questionnaires / questions / questionnaire_assignments / responses) each ran
-- a subquery against public.questionnaires, whose own long-standing policy
-- "clients view assigned questionnaires" subqueries questionnaire_assignments —
-- and the pre-existing questionnaire_assignments policy subqueries
-- questionnaires back. Adding a third policy into that mutual reference tipped
-- Postgres over its cycle limit:
--   "infinite recursion detected in policy for relation \"questionnaires\""
-- Every SELECT on questionnaires / responses / questionnaire_assignments then
-- 500s — for ALL users, not just agency ones.
--
-- Fix: drop those four policies now to restore service. Manager visibility into
-- a member's forms / check-in responses is not launch-critical; if it's wanted
-- later it must go through a SECURITY DEFINER parent-ownership helper (like
-- acts_for_admin itself) so the child policies never re-enter questionnaires RLS.
--
-- The other manager-visibility policies (users, client_stubs, sessions,
-- stub_sessions, payments, resources, session_notes, session_events,
-- reschedule_requests) do not sit in a mutual reference and are left in place.

drop policy if exists "agency managers act for members" on public.questionnaires;
drop policy if exists "agency managers act for members" on public.questions;
drop policy if exists "agency managers act for members" on public.questionnaire_assignments;
drop policy if exists "agency managers act for members" on public.responses;

notify pgrst, 'reload schema';
