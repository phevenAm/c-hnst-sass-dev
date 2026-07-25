-- Fix infinite recursion in questionnaire-related RLS policies.
--
-- The loop: questionnaires policy → queries questionnaire_assignments
--           → its admin policy queries questionnaires → repeat
--
-- Fix: security definer functions read questionnaires columns directly,
-- bypassing RLS and breaking the cycle.

create or replace function public.questionnaire_admin_id(q_id uuid)
returns uuid
language sql security definer stable
as 'select admin_id from public.questionnaires where id = q_id';

create or replace function public.questionnaire_is_demo(q_id uuid)
returns boolean
language sql security definer stable
as 'select coalesce(is_demo, false) from public.questionnaires where id = q_id';

-- questionnaire_assignments
drop policy if exists "admins manage own questionnaire assignments" on public.questionnaire_assignments;
create policy "admins manage own questionnaire assignments"
  on public.questionnaire_assignments for all
  using (public.questionnaire_admin_id(questionnaire_id) = auth.uid());

drop policy if exists "demo admins view demo questionnaire assignments" on public.questionnaire_assignments;
create policy "demo admins view demo questionnaire assignments"
  on public.questionnaire_assignments for select
  using (
    (select public.get_my_is_demo())
    and public.questionnaire_is_demo(questionnaire_id)
  );

-- questions
drop policy if exists "admins manage own questions" on public.questions;
create policy "admins manage own questions"
  on public.questions for all
  using (public.questionnaire_admin_id(questionnaire_id) = auth.uid());

drop policy if exists "demo admins view questions on demo questionnaires" on public.questions;
create policy "demo admins view questions on demo questionnaires"
  on public.questions for select
  using (
    (select public.get_my_is_demo())
    and public.questionnaire_is_demo(questionnaire_id)
  );

-- responses
drop policy if exists "admins manage own responses" on public.responses;
create policy "admins manage own responses"
  on public.responses for all
  using (public.questionnaire_admin_id(questionnaire_id) = auth.uid());

drop policy if exists "demo admins view demo responses" on public.responses;
create policy "demo admins view demo responses"
  on public.responses for select
  using (
    (select public.get_my_is_demo())
    and public.questionnaire_is_demo(questionnaire_id)
  );
