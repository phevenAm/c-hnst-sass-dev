-- Wire up the client-facing session-reminder emails.
--
-- The send-session-reminders edge function has been deployed for months but
-- nothing ever invoked it: the only cron jobs were auto-cancel-unpaid-sessions
-- and the in-app admin prep reminder. email_logs has zero 'session_reminder'
-- rows, ever. This adds the missing scheduled trigger.
--
-- Frequency: once daily. The function is built around a daily run — it looks
-- for sessions ~5 days out (practice_settings.reminder_hours_before, default
-- 120) with a +/-12h tolerance window, and does NOT dedupe against email_logs,
-- so running it more than once a day would re-email the same client. Practices
-- that set a very short reminder lead time (< ~18h) won't be served well by a
-- daily cron — that's a pre-existing design constraint of the function.
--
-- Auth: the function checks an x-internal-secret header against its
-- INTERNAL_REMINDER_SECRET env var. The matching value is read from Vault at
-- call time (same pattern as auto_cancel_unpaid_sessions). The real value is
-- NOT in this file — it's set out of band via Vault + `supabase secrets set`.

-- Placeholder Vault secret so a fresh `db reset` has a row under this name.
-- Production value set directly on 2026-08-28; any env that actually sends
-- reminders must overwrite this with a value matching INTERNAL_REMINDER_SECRET.
select vault.create_secret(
  'placeholder-set-via-supabase-secrets-and-vault',
  'internal_reminder_secret',
  'x-internal-secret for calls to the send-session-reminders edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_reminder_secret');

create or replace function public.trigger_client_session_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/send-session-reminders',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_reminder_secret')
    )
  );
end;
$func$;

-- 08:00 UTC daily (09:00 BST / 08:00 GMT) — clients get the reminder in the morning.
select cron.schedule(
  'send-client-session-reminders',
  '0 8 * * *',
  'select public.trigger_client_session_reminders()'
);
