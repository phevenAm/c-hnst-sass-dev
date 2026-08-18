-- Same bug as 20260818000000_resources_admin_id_default.sql: the
-- AdminQuestionnaires create flow (questionnairesSlice.createQuestionnaire)
-- never sends admin_id, so the insert lands null, fails the
-- "admins manage own questionnaires" RLS policy (admin_id = auth.uid()),
-- and surfaces as 42501.

alter table public.questionnaires
  alter column admin_id set default auth.uid();
