-- Invite flow: link a platform_access_token to a client_stub so that
-- when the invited person signs up the stub is auto-merged to their account.

alter table public.platform_access_token
  add column if not exists stub_id uuid references public.client_stubs(id) on delete set null;

-- Replace consume_platform_access_token so it also triggers an auto-merge
-- when the token was created as part of a stub invite.
create or replace function public.consume_platform_access_token(input_token text)
returns boolean
language plpgsql security definer
as $func$
declare
  v_admin_id uuid;
  v_stub_id  uuid;
begin
  select admin_id, stub_id
    into v_admin_id, v_stub_id
  from public.platform_access_token
  where token = input_token
    and (is_used is null or is_used = false)
    and (expires_at is null or expires_at > now());

  if not found then
    return false;
  end if;

  update public.platform_access_token
    set is_used = true, used_at = now()
    where token = input_token;

  -- Link the new user to the admin who owns this token
  update public.users
    set admin_id = v_admin_id
    where id = auth.uid();

  -- If this was a stub invite, auto-merge the stub into the new account
  if v_stub_id is not null then
    update public.session_notes
      set user_id = auth.uid(), stub_id = null
      where stub_id = v_stub_id;

    update public.client_stubs
      set linked_user_id = auth.uid()
      where id = v_stub_id;
  end if;

  return true;
end;
$func$;
