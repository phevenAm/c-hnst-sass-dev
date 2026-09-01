-- ─────────────────────────────────────────────────────────────────────────────
-- Admin-initiated deactivate / reactivate for a client.
--
--   admin_archive_client(target, reason, anonymise)
--     - relationship ended; keep all history
--     - blocks the client's login (auth.users.banned_until = 'infinity' AND
--       users.disabled = true, so both the GoTrue layer and the app-level
--       check in AuthContext reject them)
--     - optionally anonymises in the same call
--
--   admin_unarchive_client(target)
--     - reverses archive: clears archived_at + the login blocks
--     - does NOT un-anonymise (PII is already gone); the codename stays
--
-- Hard erasure remains delete_user_by_id() — unchanged, still the deliberate
-- destructive path.
-- ─────────────────────────────────────────────────────────────────────────────

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
end;
$func$;

create or replace function public.admin_unarchive_client(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
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
  set archived_at     = null,
      archived_reason  = null,
      disabled         = false
  where id = target_user_id;

  update auth.users
  set banned_until = null
  where id = target_user_id;
end;
$func$;

revoke execute on function public.admin_archive_client(uuid, text, boolean) from anon;
revoke execute on function public.admin_unarchive_client(uuid) from anon;
grant  execute on function public.admin_archive_client(uuid, text, boolean) to authenticated;
grant  execute on function public.admin_unarchive_client(uuid) to authenticated;
