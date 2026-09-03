-- Crisis & urgent support is now a dedicated, always-reachable page (/help,
-- linked from the client footer) with tap-to-call tel: links and proper
-- structure — see src/pages/common/HelpSupportPage. The plain-text `resources`
-- article seeded by 20260903000012 is redundant and just clutters every
-- practice's Resources list, so pull it back out:
--   1. stop seeding it for new admins,
--   2. delete the rows the earlier migration inserted,
--   3. drop the now-unused seed function.

-- 1. handle_new_user() without the crisis-resource perform (mirrors
--    20260903000013, minus that one line).
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
    perform public.seed_admin_feedback_form(new.id);
    perform public.seed_admin_default_checkin(new.id);
  end if;

  return new;
end;
$func$;

-- 2. Remove the seeded article. Scoped tightly to the seed's own shape so a
--    counsellor's own hand-made resource with a similar name is left alone.
delete from public.resources
where lower(trim(title)) = 'crisis & urgent support'
  and type = 'article'
  and category = 'Support'
  and is_pinned;

-- 3. Drop the seed helper (nothing else references it now).
drop function if exists public.seed_admin_crisis_resource(uuid);
