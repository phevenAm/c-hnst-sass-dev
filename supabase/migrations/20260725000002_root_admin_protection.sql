-- Mark the root admin account so it can never be deleted.
-- Other admin accounts can be deleted by any admin via delete_user_by_id().

alter table public.users
  add column if not exists is_root_admin boolean not null default false;

update public.users
  set is_root_admin = true
  where id = '02ad9950-0eee-4754-aa7f-6677ba578f18';

-- Recreate delete_user_by_id with the root admin guard.
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
end;
$func$ language plpgsql security definer;
