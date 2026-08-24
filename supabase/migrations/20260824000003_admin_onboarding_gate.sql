-- Forced first-run setup for new admins: business info + at least one
-- session package (session_packages, 20260822000006) must be filled in
-- before the rest of the app is usable. Existing admins are grandfathered —
-- the new column defaults to false, so every current row (and therefore
-- every admin who signed up before this migration) is exempt. Only admins
-- created from here on get onboarding_required = true.
alter table public.practice_settings
  add column if not exists onboarding_required boolean not null default false;

comment on column public.practice_settings.onboarding_required is
  'True only for admins who signed up after this gate shipped and have not yet completed first-run setup. Existing admins are grandfathered in at false.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $func$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'client');
  if v_role not in ('admin', 'client') then
    v_role := 'client';
  end if;

  insert into public.users (id, first_name, last_name, dob, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'dob', '')), '')::date,
    v_role
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
