-- Admin-assigned codename for each client (shown instead of real name when enabled).
alter table public.users
  add column if not exists admin_codename text;

-- Practice-wide toggle: when true, admin UI shows codenames instead of real names.
alter table public.practice_settings
  add column if not exists use_client_codenames boolean not null default false;

-- No new RLS needed: the existing "admins update own clients" policy on public.users
-- (admin_id = auth.uid() and role = 'client') already covers the new column.
