-- Surfaces RCADS in the Forms admin UI and the generic assignment system
-- (questionnaire_assignments) like every other form, rather than being a
-- link only reachable if a client happened to find it — matches how
-- CORE-10 etc. work: admin sees it under Forms, clicks Assign, client sees
-- it under Check-in once assigned.
--
-- RCADS still isn't a *generic* form under the hood — its scoring (age/
-- gender-normed T-scores) doesn't fit the plain sum/average engine, so it
-- has no rows in `questions` and answers still go to rcads_assessments, not
-- `responses`. is_rcads is the marker the frontend uses to render the
-- dedicated /rcads flow instead of the generic question-by-question wizard,
-- and to check completion via rcads_assessments instead of `responses`.
alter table public.questionnaires
  add column if not exists is_rcads boolean not null default false;

-- The system-default template (admin_id null) — seed_admin_default_forms
-- copies this to every admin on creation, same as CORE-10.
insert into public.questionnaires (admin_id, title, description, form_type, is_active, is_system_default, is_rcads)
select null,
       'RCADS — Anxiety & Depression Screen',
       'Revised Children''s Anxiety and Depression Scale — a 47-item screen for young clients, scored automatically.',
       'outcome_measure',
       true,
       true,
       true
where not exists (
  select 1 from public.questionnaires where is_system_default = true and is_rcads = true
);

-- Backfill: give every admin who already exists their own copy, same shape
-- seed_admin_default_forms would have inserted had they signed up today.
-- The trigger only fires on new admin rows, so existing admins need this
-- one-time catch-up.
insert into public.questionnaires (admin_id, title, description, form_type, is_active, is_system_default, is_rcads, source_default_id)
select u.id,
       d.title,
       d.description,
       d.form_type,
       d.is_active,
       false,
       true,
       d.id
from public.users u
cross join (
  select * from public.questionnaires where is_system_default = true and is_rcads = true limit 1
) d
where u.role = 'admin'
  -- public.users can have rows with no matching auth.users row (e.g. an
  -- account deleted from auth but not fully cleaned up elsewhere) — the
  -- admin_id FK is to auth.users, so skip anything that would violate it.
  and exists (select 1 from auth.users au where au.id = u.id)
  and not exists (
    select 1 from public.questionnaires q where q.admin_id = u.id and q.is_rcads = true
  );

-- Going forward, seed_admin_default_forms must also copy is_rcads, or a
-- brand new admin's copy would silently lose the flag and render as a
-- generic outcome measure with zero questions.
create or replace function public.seed_admin_default_forms()
returns trigger
language plpgsql security definer set search_path = ''
as $func$
declare
  v_default  record;
  v_new_q_id uuid;
  v_q        record;
begin
  if new.role = 'admin' then
    for v_default in
      select * from public.questionnaires where is_system_default = true
    loop
      insert into public.questionnaires (
        admin_id, title, description, frequency, is_active,
        form_type, is_system_default, source_default_id, is_rcads
      ) values (
        new.id,
        v_default.title,
        v_default.description,
        v_default.frequency,
        v_default.is_active,
        v_default.form_type,
        false,
        v_default.id,
        v_default.is_rcads
      )
      returning id into v_new_q_id;

      for v_q in
        select * from public.questions
        where questionnaire_id = v_default.id
        order by order_index
      loop
        insert into public.questions (
          questionnaire_id, text, type, order_index, is_required,
          min_value, max_value, min_label, max_label, options, tag_id
        ) values (
          v_new_q_id, v_q.text, v_q.type, v_q.order_index, v_q.is_required,
          v_q.min_value, v_q.max_value, v_q.min_label, v_q.max_label,
          v_q.options, v_q.tag_id
        );
      end loop;
    end loop;
  end if;
  return new;
end;
$func$;
