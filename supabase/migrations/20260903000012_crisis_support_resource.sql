-- ─────────────────────────────────────────────────────────────────────────────
-- Seed a default "Crisis & urgent support" resource for every practice.
--
-- It's a normal owned `resources` row (no system-default linkage) so each
-- counsellor can edit the numbers, add local crisis-team details, or delete it.
-- Pinned + published so it sits at the top of the client Resources list and is
-- the target of the new client footer's "Help & support" link.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.seed_admin_crisis_resource(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if exists (
    select 1 from public.resources
    where admin_id = p_admin_id and lower(trim(title)) = 'crisis & urgent support'
  ) then
    return;
  end if;

  insert into public.resources
    (admin_id, title, summary, content, type, category, is_pinned, is_published, is_sensitive)
  values (
    p_admin_id,
    'Crisis & urgent support',
    'If you need help right now, these lines are open when your counsellor is not.',
    'Your counselling sessions are not an emergency service. If you are in crisis or worried about your safety, please use one of the options below — they are available outside session times.'
      || E'\n\n'
      || 'If your life is at risk, or you have seriously harmed yourself: call 999 or go to your nearest A&E.'
      || E'\n\n'
      || 'Samaritans — 116 123. Free, 24 hours a day, every day. You do not have to be suicidal to call.'
      || E'\n\n'
      || 'NHS 111, then option 2 — urgent mental health support, 24/7, for you or someone you are worried about.'
      || E'\n\n'
      || 'Shout — text SHOUT to 85258. Free, confidential, 24/7 text support.'
      || E'\n\n'
      || 'CALM (Campaign Against Living Miserably) — 0800 58 58 58, 5pm to midnight, every day.'
      || E'\n\n'
      || 'For non-urgent help, contact your GP and ask for an urgent appointment, or speak to your counsellor at your next session.',
    'article',
    'Support',
    true,
    true,
    false
  );
end;
$func$;

-- Backfill every existing counsellor (skip orphaned public.users rows).
do $backfill$
declare
  r record;
begin
  for r in
    select u.id
    from public.users u
    join auth.users au on au.id = u.id
    where u.role = 'admin'
  loop
    perform public.seed_admin_crisis_resource(r.id);
  end loop;
end;
$backfill$;

-- Add the seed call to new-admin setup. Body mirrors
-- 20260903000004_check_in_forms.sql with one extra perform.
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
    perform public.seed_admin_crisis_resource(new.id);
  end if;

  return new;
end;
$func$;
