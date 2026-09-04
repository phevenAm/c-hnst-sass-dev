-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: an admin could not delete their own account at all.
--
-- delete_own_account() (admin branch) runs `delete from public.users` then
-- `delete from auth.users`. The AFTER DELETE audit trigger on public.users —
-- and the audit triggers on every table that cascade-deletes with it
-- (questionnaires seeded at signup, responses, assignments, …) — each do
-- `insert into audit_logs (actor_id, …) values (auth.uid(), …)`. Something in
-- that cascade leaves audit_logs.actor_id pointing at a row that's already
-- gone, so `audit_logs_actor_id_fkey` fails and the whole RPC rolls back.
-- Verified live 2026-09-04 on a fresh admin (paused OR not) — the feature was
-- simply non-functional.
--
-- Fix: a transaction-local `app.skip_audit` flag that log_table_change()
-- honours, set only for the admin hard-delete path. We don't want audit rows
-- for a practice that's being erased anyway, and it sidesteps the FK race.
-- The client self-close branch is untouched — it only UPDATEs rows, keeps its
-- audit trail, and never hit this.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Set by delete_own_account() for the admin hard-delete: the account and its
  -- whole practice are going, and auditing the teardown just trips the
  -- audit_logs.actor_id FK against the row being removed.
  if coalesce(current_setting('app.skip_audit', true), '') = 'on' then
    return null;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(
      (case tg_op when 'DELETE' then row_to_json(old)::jsonb->>'id'
                  else row_to_json(new)::jsonb->>'id'
       end),
      null
    ),
    case tg_op when 'INSERT' then null else to_jsonb(old) end,
    case tg_op when 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$func$;

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
    -- Suppress the audit triggers for the teardown — see log_table_change().
    perform set_config('app.skip_audit', 'on', true);

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
