-- ─────────────────────────────────────────────────────────────────────────────
-- Client detail page: optional Age / Email / Last seen
--
-- The counsellor can reveal a client's age (from DOB), email address and last
-- active time on that client's profile — off by default, toggled per client in
-- the Configure client modal, and force-hidden practice-wide from Settings. When
-- codenames are on the FE renders these as *** rather than the real value.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Mirror auth.users.email into public.users ──────────────────────────────
-- Admins can't read the auth schema, so there was no way to show a client's
-- email in the admin UI (client.email on the detail page was always empty).
alter table public.users
  add column if not exists email text;

update public.users u
set email = au.email
from auth.users au
where au.id = u.id
  and u.email is distinct from au.email;

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$func$;

drop trigger if exists sync_user_email on auth.users;
create trigger sync_user_email
  after insert or update of email on auth.users
  for each row execute function public.sync_user_email();

-- Also stamp it on the initial row insert (same-transaction as signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $func$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'client');
  if v_role not in ('admin', 'client') then
    v_role := 'client';
  end if;

  insert into public.users (id, first_name, last_name, dob, role, email)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'dob', '')), '')::date,
    v_role,
    new.email
  );

  if v_role = 'admin' then
    insert into public.practice_settings (admin_id, business_name, onboarding_required)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'practice_name', '')), ''),
      true
    );
  end if;

  return new;
end;
$func$;

-- ── 2. Per-client visibility toggles (Configure client modal) ─────────────────
alter table public.users
  add column if not exists profile_show_age       boolean not null default false,
  add column if not exists profile_show_email     boolean not null default false,
  add column if not exists profile_show_last_seen boolean not null default false;

-- ── 3. Last seen — bumped by the client app on load (throttled client-side) ───
alter table public.users
  add column if not exists last_seen_at timestamptz;

-- ── 4. Practice-wide master hide (Settings) ───────────────────────────────────
-- When true, Age / Email / Last seen are hidden on every client profile
-- regardless of the per-client toggles above.
alter table public.practice_settings
  add column if not exists hide_client_profile_pii boolean not null default false;
