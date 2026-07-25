-- Link platform access tokens to the admin that created them.
-- When a client consumes a token on sign-up, their users.admin_id is set automatically.

alter table public.platform_access_token
  add column if not exists admin_id uuid references auth.users(id) on delete set null;

-- Backfill existing tokens to the main admin
update public.platform_access_token
  set admin_id = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where admin_id is null;

-- Enable RLS so admins only see/manage their own tokens
alter table public.platform_access_token enable row level security;

drop policy if exists "admins manage own access tokens" on public.platform_access_token;
create policy "admins manage own access tokens"
  on public.platform_access_token for all
  using (admin_id = auth.uid());

-- Recreate consume_platform_access_token to also set users.admin_id.
-- Security definer so it can write to users regardless of RLS.
create or replace function public.consume_platform_access_token(input_token text)
returns boolean
language plpgsql security definer
as $func$
declare
  v_admin_id uuid;
begin
  select admin_id into v_admin_id
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

  return true;
end;
$func$;
