-- A client sitting on their dashboard or Check-in page when an admin
-- assigns them a form never saw it appear — questionnaire_assignments had
-- no realtime subscription anywhere on the client side, so nothing refetched
-- until they navigated away and back (or reloaded). Same gap sessions had
-- before 20260727000002_realtime_sessions.sql fixed it.
alter publication supabase_realtime add table public.questionnaire_assignments;
alter table public.questionnaire_assignments replica identity full;
