-- Add email_logs.stub_session_id so shadow-client (stub) session reminders can
-- be de-duplicated the same way real-session reminders are.
--
-- send-session-reminders runs on a daily cron with a +/-12h match window wide
-- enough that a session can qualify on two consecutive runs. Real sessions are
-- guarded by looking up a prior 'sent' row in email_logs by session_id; stub
-- reminders logged with session_id = null had no key to check, so a stub client
-- could get two reminder emails. This column is that key.

alter table public.email_logs
  add column if not exists stub_session_id uuid
    references public.stub_sessions (id) on delete set null;

-- Dedupe lookup: "has this stub session already had a sent reminder?"
create index if not exists email_logs_stub_session_reminder_sent_idx
  on public.email_logs (stub_session_id)
  where stub_session_id is not null
    and email_type = 'session_reminder'
    and status = 'sent';

-- Matching index for the real-session dedupe lookup that already runs each cron.
create index if not exists email_logs_session_reminder_sent_idx
  on public.email_logs (session_id)
  where session_id is not null
    and email_type = 'session_reminder'
    and status = 'sent';
