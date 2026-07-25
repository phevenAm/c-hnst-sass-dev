-- Demo admins (is_demo = true) see only is_demo rows.
-- Real admins see only their own rows (admin_id = auth.uid()).
-- get_my_is_demo() is security definer so it bypasses RLS — safe to call here.

-- questionnaires
create policy "demo admins view demo questionnaires"
  on public.questionnaires for select
  using (is_demo = true and (select public.get_my_is_demo()));

-- questions (via demo questionnaire)
create policy "demo admins view questions on demo questionnaires"
  on public.questions for select
  using (
    (select public.get_my_is_demo())
    and exists (
      select 1 from public.questionnaires q
      where q.id = questions.questionnaire_id and q.is_demo = true
    )
  );

-- questionnaire_assignments (via demo questionnaire)
create policy "demo admins view demo questionnaire assignments"
  on public.questionnaire_assignments for select
  using (
    (select public.get_my_is_demo())
    and exists (
      select 1 from public.questionnaires q
      where q.id = questionnaire_assignments.questionnaire_id and q.is_demo = true
    )
  );

-- responses (via demo questionnaire)
create policy "demo admins view demo responses"
  on public.responses for select
  using (
    (select public.get_my_is_demo())
    and exists (
      select 1 from public.questionnaires q
      where q.id = responses.questionnaire_id and q.is_demo = true
    )
  );

-- resources
create policy "demo admins view demo resources"
  on public.resources for select
  using (is_demo = true and (select public.get_my_is_demo()));

-- tags (via demo question)
create policy "demo admins view demo tags"
  on public.tags for select
  using (is_demo = true and (select public.get_my_is_demo()));

-- users — demo admin sees demo client rows
create policy "demo admins view demo clients"
  on public.users for select
  using (
    is_demo = true
    and role = 'client'
    and (select public.get_my_is_demo())
  );

-- sessions — no is_demo column, scope via demo client
create policy "demo admins view demo sessions"
  on public.sessions for select
  using (
    (select public.get_my_is_demo())
    and exists (
      select 1 from public.users u
      where u.id = sessions.client_id and u.is_demo = true
    )
  );

-- session_events (via demo session → demo client)
create policy "demo admins view demo session events"
  on public.session_events for select
  using (
    (select public.get_my_is_demo())
    and exists (
      select 1 from public.sessions s
      join public.users u on u.id = s.client_id
      where s.id = session_events.session_id and u.is_demo = true
    )
  );
