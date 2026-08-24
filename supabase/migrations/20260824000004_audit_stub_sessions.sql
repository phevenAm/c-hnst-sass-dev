-- stub_sessions had no audit trigger, unlike every other client_stubs child
-- table (session_notes, questionnaire_assignments, payments). Discovered
-- 2026-08-24 the hard way: a client_stubs delete cascades to stub_sessions
-- with zero trace in audit_logs, and this project has neither PITR nor any
-- physical backups enabled, so a mistaken deletion of a stub with sessions
-- would have been permanently unrecoverable. Closing that gap here, plus two
-- other client_stubs children that were similarly uncovered.
drop trigger if exists audit_stub_sessions on public.stub_sessions;
create trigger audit_stub_sessions
  after insert or update or delete on public.stub_sessions
  for each row execute function public.log_table_change();

drop trigger if exists audit_admin_reminder_mutes on public.admin_reminder_mutes;
create trigger audit_admin_reminder_mutes
  after insert or update or delete on public.admin_reminder_mutes
  for each row execute function public.log_table_change();

drop trigger if exists audit_platform_access_token on public.platform_access_token;
create trigger audit_platform_access_token
  after insert or update or delete on public.platform_access_token
  for each row execute function public.log_table_change();

notify pgrst, 'reload schema';
