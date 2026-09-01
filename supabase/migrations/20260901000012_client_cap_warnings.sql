-- Daily "approaching your client cap" admin email + the grants its edge
-- function needs.

-- 1. The count / check helpers from 20260901000011 were granted to
--    `authenticated` only. Edge functions call them with the service-role key,
--    and `change-subscription-plan` already relies on plan_change_check — give
--    service_role explicit EXECUTE so those calls don't fail on privileges.
grant execute on function public.active_client_count(uuid)   to service_role;
grant execute on function public.archived_client_count(uuid) to service_role;
grant execute on function public.plan_change_check(text)     to service_role;

-- 2. Vault placeholder so a fresh `db reset` has a row under this name. The
--    real value is set out of band (Vault + `supabase secrets set
--    INTERNAL_CLIENT_CAP_SECRET`), and the two must match.
select vault.create_secret(
  'placeholder-set-via-supabase-secrets-and-vault',
  'internal_client_cap_secret',
  'x-internal-secret for calls to the notify-client-cap edge function'
) where not exists (select 1 from vault.secrets where name = 'internal_client_cap_secret');

-- 3. Cron trigger — fires the edge function; the function itself does the
--    per-practice capacity check, the 14-day dedupe and the send.
create or replace function public.trigger_client_cap_warnings()
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-client-cap',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_client_cap_secret')
    )
  );
end;
$func$;

-- 09:00 UTC daily.
select cron.schedule(
  'notify-client-cap-warnings',
  '0 9 * * *',
  'select public.trigger_client_cap_warnings()'
);
