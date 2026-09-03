-- ─────────────────────────────────────────────────────────────────────────────
-- "Check-in" as a first-class form type + a seeded feedback form per practice
--
-- Until now every custom form was form_type = 'outcome_measure', so recurring
-- tagged/plottable check-ins and one-off clinical instruments looked the same.
-- 'check_in' is now its own type: it's the only kind that recurs, carries chart
-- tags and can be plotted on the wellbeing chart (enforced in the UI).
--
-- Only one existing custom form is actually a check-in — the one literally
-- called "Daily Check-In" — so that's the only row migrated.
--
-- Every existing and future counsellor also gets their own editable "Session
-- feedback" form (form_type = 'feedback') to ask clients how sessions are
-- going. It's a normal owned row — no source_default_id — so they can edit or
-- delete it like anything they built themselves.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Allow the new type ────────────────────────────────────────────────────
alter table public.questionnaires
  drop constraint if exists questionnaires_form_type_check;

alter table public.questionnaires
  add constraint questionnaires_form_type_check
  check (form_type = any (array['check_in', 'outcome_measure', 'feedback', 'onboarding']::text[]));

-- ── 2. Reclassify the one real check-in ──────────────────────────────────────
update public.questionnaires
set form_type = 'check_in'
where form_type = 'outcome_measure'
  and coalesce(is_system_default, false) = false
  and lower(trim(title)) = 'daily check-in';

-- ── 3. Per-practice "Session feedback" form ──────────────────────────────────
create or replace function public.seed_admin_feedback_form(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_qid uuid;
begin
  -- Idempotent: skip if this practice already has a feedback form by this name.
  if exists (
    select 1 from public.questionnaires
    where admin_id = p_admin_id and form_type = 'feedback' and lower(trim(title)) = 'session feedback'
  ) then
    return;
  end if;

  insert into public.questionnaires (admin_id, title, description, frequency, is_active, form_type, is_system_default)
  values (
    p_admin_id,
    'Session feedback',
    'A short check on how sessions are going and what feels different lately.',
    null,
    true,
    'feedback',
    false
  )
  returning id into v_qid;

  insert into public.questions (questionnaire_id, text, type, order_index, is_required, min_value, max_value, min_label, max_label, options)
  values
    (v_qid, 'How helpful was this session for you?', 'scale', 0, true, 1, 10, 'Not helpful', 'Very helpful', '[]'::jsonb),
    (v_qid, 'How comfortable did you feel talking openly?', 'scale', 1, true, 1, 10, 'Not at all', 'Completely', '[]'::jsonb),
    (v_qid, 'What has felt different or improved for you lately?', 'text', 2, false, null, null, null, null, '[]'::jsonb),
    (v_qid, 'Is there anything you would like your counsellor to do differently?', 'text', 3, false, null, null, null, null, '[]'::jsonb);
end;
$func$;

-- Backfill every existing counsellor (skip orphan public.users rows whose
-- auth.users record is gone — the FK on questionnaires.admin_id points there).
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
    perform public.seed_admin_feedback_form(r.id);
  end loop;
end;
$backfill$;

-- ── 4. Seed it for new counsellors on signup ────────────────────────────────
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
  end if;

  return new;
end;
$func$;
