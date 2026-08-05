-- Update delete_own_account: fire-and-forget avatar cleanup via pg_net after deletion.
-- The Edge Function (delete-user-avatar) deletes avatars/{user_id}.jpg from storage.
-- INTERNAL_AVATAR_SECRET must be set in Supabase Edge Function secrets (see below).
create or replace function public.delete_own_account()
returns void as $func$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.users where id = v_uid;
  delete from auth.users where id = v_uid;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
    body    := jsonb_build_object('user_id', v_uid::text)::text,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', 'wm-avatar-cleanup-8f4e2a1c9b3d'
    )
  );
end;
$func$ language plpgsql security definer;


-- Update delete_user_by_id: same cleanup, preserving root-admin guard.
create or replace function public.delete_user_by_id(target_user_id uuid)
returns void as $func$
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Unauthorized';
  end if;

  if exists (
    select 1 from public.users
    where id = target_user_id and is_root_admin = true
  ) then
    raise exception 'Cannot delete the root admin account';
  end if;

  delete from public.users where id = target_user_id;
  delete from auth.users where id = target_user_id;

  perform net.http_post(
    url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/delete-user-avatar',
    body    := jsonb_build_object('user_id', target_user_id::text)::text,
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', 'wm-avatar-cleanup-8f4e2a1c9b3d'
    )
  );
end;
$func$ language plpgsql security definer;
