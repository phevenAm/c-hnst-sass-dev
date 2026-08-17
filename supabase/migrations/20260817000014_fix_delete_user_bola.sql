-- Security fix: delete_user_by_id must verify the target belongs to the calling admin's practice.
-- Without this check any admin could delete clients belonging to a different counsellor.
-- Note: the avatar-cleanup secret hardcoded below must be updated after INTERNAL_AVATAR_SECRET is rotated.
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

  if not exists (
    select 1 from public.users
    where id = target_user_id and admin_id = auth.uid()
  ) then
    raise exception 'Cannot delete a client that does not belong to your practice';
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
