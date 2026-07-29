-- Add is_superadmin flag to users table.
-- Only the platform owner (Stephen) should have this set to true.
-- Set it manually after running: UPDATE public.users SET is_superadmin = true WHERE email = 'smissah321@gmail.com';
-- (email column comes from auth.users via join — match on id instead if preferred)

alter table public.users
  add column if not exists is_superadmin boolean not null default false;

comment on column public.users.is_superadmin is
  'Platform owner flag. Grants access to /superadmin route and get-all-practices edge function.';

-- RLS: superadmin can read all users rows (needed for the admin panel).
-- NOTE: this policy is recursive (queries public.users from a policy ON
-- public.users) and is replaced by the security-definer version in
-- 20260729000000_fix_superadmin_rls.sql. Kept here for migration history;
-- the drop-if-exists makes this file safe to re-run.
drop policy if exists "superadmin can read all users" on public.users;
create policy "superadmin can read all users"
  on public.users
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.is_superadmin = true
    )
  );

-- After running this migration, set your account as superadmin:
-- UPDATE public.users SET is_superadmin = true WHERE id = '<your-auth-uuid>';
