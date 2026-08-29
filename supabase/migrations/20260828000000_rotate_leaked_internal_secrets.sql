-- Rotate the three internal service-to-service secrets whose previous values
-- were committed to this (public) repo in plain text — first inside the
-- edge-function-invoking SQL bodies, then again as literals in
-- 20260826000014_move_internal_secrets_to_vault.sql.
--
-- Dead values, do not reuse: wm-avatar-cleanup-8f4e2a1c9b3d,
-- ac-nl-cancel-e71a3b8c, gc-sync-f3a9d1e2.
--
-- The real replacement values are NOT stored here — putting them in a
-- committed migration is exactly the mistake being corrected. On 2026-08-28
-- they were set out of band:
--   * Vault (what the SQL callers send):        applied directly to the
--     production DB when this migration first ran.
--   * Edge function env vars (what they check):  `supabase secrets set
--     INTERNAL_AVATAR_SECRET=… INTERNAL_AUTO_CANCEL_SECRET=…
--     INTERNAL_GOOGLE_SYNC_SECRET=…`
--
-- This migration only clears the stale entries and seeds a placeholder so a
-- fresh `db reset` has a row under each name. Any environment that actually
-- invokes these edge functions must overwrite the placeholders via Vault +
-- `supabase secrets set` with a matching pair. The SQL callers
-- (delete_own_account, delete_user_by_id, auto_cancel_unpaid_sessions,
-- trigger_google_calendar_sync) read by name from vault.decrypted_secrets at
-- call time, so no function bodies change.

do $rot$
declare
  s record;
begin
  for s in
    select unnest(array[
      'internal_avatar_cleanup_secret',
      'internal_auto_cancel_secret',
      'internal_gcal_sync_secret'
    ]) as name
  loop
    delete from vault.secrets where name = s.name;
    perform vault.create_secret(
      'placeholder-set-via-supabase-secrets-and-vault',
      s.name,
      'x-internal-secret for internal edge-function calls — real value set out of band, see migration 20260828000000'
    );
  end loop;
end $rot$;
