-- Allow counsellors to self-register as admins by passing role: 'admin' in signUp metadata.
-- practice_settings row is created automatically so the admin can use the app immediately.
-- subscription_status defaults to 'inactive'; the app gates access until they subscribe.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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
    insert into public.practice_settings (admin_id, business_name)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'practice_name', '')), '')
    )
    on conflict (admin_id) do nothing;
  end if;

  return new;
end;
$$;
