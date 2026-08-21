-- Postgres does NOT automatically index foreign-key columns (only primary
-- keys get one for free). Several hot-path tables — hit on every page load
-- via NotificationBell, Navbar, InterfacePrefsContext, and the client/admin
-- dashboards — have been doing full sequential scans since they were
-- created. This is the direct cause of the 2-2.5s "slow request" warnings
-- logged by fetchWithTimeout on responses/notifications/sessions/
-- questionnaires, and gets worse as row counts grow with real usage.

-- notifications: NotificationBell polls user_id + order by created_at on
-- every mount, with no index at all on the table.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- responses: client dashboard/admin export fetch by user_id ordered by
-- submitted_at.
create index if not exists responses_user_submitted_idx
  on public.responses (user_id, submitted_at desc);
create index if not exists responses_questionnaire_id_idx
  on public.responses (questionnaire_id);

-- sessions: client_id (client's own schedule), created_by (admin's book of
-- sessions), scheduled_at (calendar range queries + chronological sort),
-- status (filtering cancelled/scheduled/completed).
create index if not exists sessions_client_id_idx
  on public.sessions (client_id);
create index if not exists sessions_created_by_idx
  on public.sessions (created_by);
create index if not exists sessions_scheduled_at_idx
  on public.sessions (scheduled_at);
create index if not exists sessions_status_idx
  on public.sessions (status);
-- Block-booking membership is the JSON convention metadata->>'block_id'
-- (see 20260819000006_block_aware_manual_payment.sql) — indexed as a
-- partial expression index since most sessions aren't part of a block.
create index if not exists sessions_block_id_idx
  on public.sessions ((metadata->>'block_id'))
  where metadata->>'block_id' is not null;

-- questionnaires / questions / questionnaire_assignments: the nested
-- select (questionnaires -> questions -> tags, questionnaire_assignments)
-- fired on every questionnaire list load joins through these FKs.
create index if not exists questionnaires_admin_id_idx
  on public.questionnaires (admin_id);
create index if not exists questions_questionnaire_id_idx
  on public.questions (questionnaire_id);
create index if not exists questions_tag_id_idx
  on public.questions (tag_id);
create index if not exists qa_user_id_idx
  on public.questionnaire_assignments (user_id);
create index if not exists qa_questionnaire_id_idx
  on public.questionnaire_assignments (questionnaire_id);

-- users: every admin-scoped list (clients, payments, etc.) filters by
-- admin_id; RLS policies also join through it on nearly every request.
create index if not exists users_admin_id_idx
  on public.users (admin_id);

-- payments: admin's payments list + per-client history.
create index if not exists payments_admin_id_idx
  on public.payments (admin_id);
create index if not exists payments_client_id_idx
  on public.payments (client_id);
create index if not exists payments_stub_id_idx
  on public.payments (stub_id);

-- session_events: session detail/audit trail lookups by session_id had no
-- index despite being a FK.
create index if not exists session_events_session_id_idx
  on public.session_events (session_id);
