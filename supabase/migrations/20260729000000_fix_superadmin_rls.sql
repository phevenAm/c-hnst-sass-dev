-- Fix: the superadmin policy I wrote queries public.users from inside a policy
-- on public.users — causes infinite recursion for every user fetch.
-- Solution: security definer function runs as postgres (bypasses RLS), no loop.

drop policy if exists "superadmin can read all users" on public.users;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $func$
  select coalesce(
    (select is_superadmin from public.users where id = auth.uid()),
    false
  );
$func$;

create policy "superadmin can read all users"
  on public.users
  for select
  using (public.is_superadmin());
