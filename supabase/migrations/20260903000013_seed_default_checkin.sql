-- ─────────────────────────────────────────────────────────────────────────────
-- Seed a ready-made "Weekly check-in" for every practice.
--
-- form_type = 'check_in' (the only kind the wellbeing chart plots). Its five
-- scale questions are each tagged with a category (Mood, Sleep, Energy,
-- Connection, Self-care) so ProgressChart draws one line per category rather
-- than one per long question. It's a normal owned row — edit or delete freely.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.seed_admin_default_checkin(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_qid uuid;
  v_tag uuid;
  v_idx integer := 0;
  v_row record;
begin
  if exists (
    select 1 from public.questionnaires
    where admin_id = p_admin_id
      and form_type = 'check_in'
      and lower(trim(title)) = 'weekly check-in'
  ) then
    return;
  end if;

  insert into public.questionnaires
    (admin_id, title, description, frequency, is_active, form_type, is_system_default)
  values (
    p_admin_id,
    'Weekly check-in',
    'A quick weekly temperature check — how have things been across a few everyday areas of life.',
    'weekly',
    true,
    'check_in',
    false
  )
  returning id into v_qid;

  for v_row in
    select * from (values
      ('Mood',       'How has your mood been this week?',                         'Low',      'Great'),
      ('Sleep',      'How well have you been sleeping?',                          'Poorly',   'Really well'),
      ('Energy',     'How have your energy levels been?',                         'Drained',  'Energised'),
      ('Connection', 'How connected have you felt to the people around you?',     'Isolated', 'Very connected'),
      ('Self-care',  'How well have you been able to look after yourself?',       'Not much', 'Really well')
    ) as t(tag_name, q_text, min_l, max_l)
  loop
    select id into v_tag from public.tags where admin_id = p_admin_id and name = v_row.tag_name;
    if v_tag is null then
      insert into public.tags (admin_id, name) values (p_admin_id, v_row.tag_name) returning id into v_tag;
    end if;

    insert into public.questions
      (questionnaire_id, text, type, order_index, is_required,
       min_value, max_value, min_label, max_label, options, tag_id)
    values
      (v_qid, v_row.q_text, 'scale', v_idx, true,
       1, 10, v_row.min_l, v_row.max_l, '[]'::jsonb, v_tag);

    v_idx := v_idx + 1;
  end loop;
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
    perform public.seed_admin_default_checkin(r.id);
  end loop;
end;
$backfill$;

-- New-admin setup: feedback form + crisis resource + default check-in.
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
    perform public.seed_admin_default_checkin(new.id);
  end if;

  return new;
end;
$func$;
