-- ─────────────────────────────────────────────────────────────────────────────
-- Rewrite delete_own_account() so a client "closing their account" ARCHIVES +
-- ANONYMISES instead of hard-deleting.
--
-- Before: delete from public.users; delete from auth.users;  → cascaded away
-- check-in history, orphaned sessions/payments, and let the client destroy the
-- counsellor's clinical record they're obliged to retain.
--
-- After:
--   * public.users row is KEPT — every session / payment / response / note FK
--     that points at it stays valid, so the practice's history & stats stay
--     accurate and attributable (to a codename, not a name).
--   * anonymise_client() scrubs the PII (names, dob, avatar, email on
--     auth.users, metadata) and assigns a codename.
--   * archived_at / archived_reason = 'self_closed' / disabled = true mark the
--     relationship as ended.
--   * auth.users.banned_until = 'infinity' kills the login at the GoTrue layer
--     (password reset can't revive it — the email is gone too).
--
-- The counsellor can still hard-erase later (delete_user_by_id), which is now
-- the single deliberate destructive path.
--
-- Note: the preserve_notes_on_user_delete BEFORE DELETE trigger no longer fires
-- for this flow (no DELETE happens) — notes simply stay on the anonymised row,
-- which is the better outcome.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Admins keep the hard-delete behaviour: a practice account closing down
  -- shouldn't leave a scrubbed shell behind, and it has no clinical record
  -- that anyone else is obliged to retain. (Billing is cancelled client-side
  -- before this RPC is called — see DeleteUserModal.)
  if exists (select 1 from public.users where id = v_uid and role = 'admin') then
    delete from public.users where id = v_uid;
    delete from auth.users where id = v_uid;

    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
      body    := jsonb_build_object('user_id', v_uid::text),
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_avatar_cleanup_secret')
      )
    );
    return;
  end if;

  -- Clients: archive + anonymise, keep the row.
  update public.users
  set archived_at     = coalesce(archived_at, now()),
      archived_reason = 'self_closed',
      disabled        = true
  where id = v_uid;

  perform public.anonymise_client(v_uid);

  update auth.users
  set banned_until = 'infinity'
  where id = v_uid;

  -- Remove the avatar file from Storage (the column is already nulled above).
  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
    body    := jsonb_build_object('user_id', v_uid::text),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_avatar_cleanup_secret')
    )
  );
end;
$func$;
