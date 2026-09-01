-- ─────────────────────────────────────────────────────────────────────────────
-- Notify the client by email when their account is deactivated, reactivated, or
-- closed. Wires net.http_post -> notify-client-lifecycle into the three lifecycle
-- functions from 20260901000001 / 20260901000002.
--
-- Timing matters: anonymise_client() overwrites auth.users.email with an
-- unreachable `…@deleted.invalid` sentinel. So each function captures the real
-- address into a local BEFORE any anonymisation and passes it explicitly to the
-- edge function, which uses it in preference to re-reading auth.users.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── email_logs: allow the account-status email types ───────────────────────
alter table public.email_logs drop constraint if exists email_logs_email_type_check;

alter table public.email_logs
  add constraint email_logs_email_type_check check (
    email_type in (
      'session_reminder',
      'session_booked',
      'session_cancelled',
      'session_rescheduled',
      'payment_reminder',
      'payment_confirmed',
      'questionnaire_assigned',
      'stub_invite',
      'stub_joined',
      'feedback',
      'reschedule_request',
      'client_invite',
      'account_deactivated',
      'account_reactivated',
      'account_closed'
    )
  );

-- ── Internal secret for the SQL -> edge-function call ──────────────────────
-- Real value set out of band (Vault + `supabase secrets set
-- INTERNAL_CLIENT_LIFECYCLE_SECRET=…`), same convention as the other
-- internal_* secrets. This only seeds a placeholder so `db reset` has a row.
select vault.create_secret(
  'placeholder-set-via-supabase-secrets-and-vault',
  'internal_client_lifecycle_secret',
  'x-internal-secret for calls to the notify-client-lifecycle edge function — real value set out of band'
) where not exists (select 1 from vault.secrets where name = 'internal_client_lifecycle_secret');

-- ── notify_client_lifecycle(user_id, event, email) ────────────────────────
-- Thin wrapper around the net.http_post so the three callers don't repeat it.
-- Skips silently when there's no reachable address (already anonymised, or the
-- client never had one).
create or replace function public.notify_client_lifecycle(
  p_user_id uuid,
  p_event   text,
  p_email   text
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if p_email is null or p_email = '' or p_email like '%@deleted.invalid' then
    return;
  end if;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-client-lifecycle',
    body    := jsonb_build_object('event', p_event, 'user_id', p_user_id::text, 'client_email', p_email),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_client_lifecycle_secret')
    )
  );
end;
$func$;

revoke execute on function public.notify_client_lifecycle(uuid, text, text) from anon, authenticated;

-- ── admin_archive_client: + deactivated email ─────────────────────────────
create or replace function public.admin_archive_client(
  target_user_id uuid,
  p_reason       text default null,
  p_anonymise    boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_email text;
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.users
    where id = target_user_id
      and admin_id = auth.uid()
      and role = 'client'
  ) then
    raise exception 'Client not found or not part of your practice';
  end if;

  if exists (
    select 1 from public.users where id = target_user_id and is_root_admin = true
  ) then
    raise exception 'Cannot archive the root admin account';
  end if;

  -- Capture the reachable address before anonymisation can scrub it.
  select email into v_email from auth.users where id = target_user_id;

  update public.users
  set archived_at     = coalesce(archived_at, now()),
      archived_reason = p_reason,
      disabled        = true
  where id = target_user_id;

  update auth.users
  set banned_until = 'infinity'
  where id = target_user_id;

  if p_anonymise then
    perform public.anonymise_client(target_user_id);
  end if;

  perform public.notify_client_lifecycle(target_user_id, 'deactivated', v_email);
end;
$func$;

-- ── admin_unarchive_client: + reactivated email ──────────────────────────
create or replace function public.admin_unarchive_client(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_email text;
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.users
    where id = target_user_id and admin_id = auth.uid() and role = 'client'
  ) then
    raise exception 'Client not found or not part of your practice';
  end if;

  update public.users
  set archived_at    = null,
      archived_reason = null,
      disabled        = false
  where id = target_user_id;

  update auth.users
  set banned_until = null
  where id = target_user_id;

  -- If the client was anonymised while deactivated, v_email is the sentinel
  -- and notify_client_lifecycle() skips — there's no address to reach.
  select email into v_email from auth.users where id = target_user_id;
  perform public.notify_client_lifecycle(target_user_id, 'reactivated', v_email);
end;
$func$;

-- ── delete_own_account: + closed email (client branch) ───────────────────
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Admins keep the hard-delete behaviour.
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

  -- Clients: archive + anonymise, keep the row. Grab the address first so the
  -- confirmation email can still reach them.
  select email into v_email from auth.users where id = v_uid;

  update public.users
  set archived_at     = coalesce(archived_at, now()),
      archived_reason = 'self_closed',
      disabled        = true
  where id = v_uid;

  perform public.anonymise_client(v_uid);

  update auth.users
  set banned_until = 'infinity'
  where id = v_uid;

  perform public.notify_client_lifecycle(v_uid, 'closed', v_email);

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
