-- Scope all admin-owned tables to their owning admin.
-- Main admin UUID: 02ad9950-0eee-4754-aa7f-6677ba578f18
--
-- Strategy:
--   - questionnaires / resources / tags: add admin_id column, backfill, NOT NULL
--   - users: add admin_id for client rows (null = admin account, no owner)
--   - sessions: already has created_by — backfill nulls, enforce in RLS
--   - child tables (questions, assignments, responses, session_events,
--     reschedule_requests): no new column — RLS joins to parent

-- ─────────────────────────────────────────────────────────────
-- users.admin_id must exist before any policy references it
-- ─────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists admin_id uuid references auth.users(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- questionnaires
-- ─────────────────────────────────────────────────────────────
alter table public.questionnaires
  add column if not exists admin_id uuid references auth.users(id) on delete cascade;

update public.questionnaires
  set admin_id = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where admin_id is null;

alter table public.questionnaires alter column admin_id set not null;

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'questionnaires'
  loop
    execute format('drop policy %I on public.questionnaires', pol);
  end loop;
end $$;

create policy "admins manage own questionnaires"
  on public.questionnaires for all
  using (admin_id = auth.uid());

create policy "clients view assigned questionnaires"
  on public.questionnaires for select
  using (
    exists (
      select 1 from public.questionnaire_assignments qa
      where qa.questionnaire_id = questionnaires.id
        and qa.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- questions  (inherits scope via questionnaires.admin_id)
-- ─────────────────────────────────────────────────────────────
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'questions'
  loop
    execute format('drop policy %I on public.questions', pol);
  end loop;
end $$;

create policy "admins manage own questions"
  on public.questions for all
  using (
    exists (
      select 1 from public.questionnaires q
      where q.id = questions.questionnaire_id and q.admin_id = auth.uid()
    )
  );

create policy "clients view questions on assigned questionnaires"
  on public.questions for select
  using (
    exists (
      select 1 from public.questionnaire_assignments qa
      where qa.questionnaire_id = questions.questionnaire_id
        and qa.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- questionnaire_assignments
-- ─────────────────────────────────────────────────────────────
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'questionnaire_assignments'
  loop
    execute format('drop policy %I on public.questionnaire_assignments', pol);
  end loop;
end $$;

create policy "admins manage own questionnaire assignments"
  on public.questionnaire_assignments for all
  using (
    exists (
      select 1 from public.questionnaires q
      where q.id = questionnaire_assignments.questionnaire_id
        and q.admin_id = auth.uid()
    )
  );

create policy "clients view own assignments"
  on public.questionnaire_assignments for select
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- responses
-- ─────────────────────────────────────────────────────────────
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'responses'
  loop
    execute format('drop policy %I on public.responses', pol);
  end loop;
end $$;

create policy "admins manage own responses"
  on public.responses for all
  using (
    exists (
      select 1 from public.questionnaires q
      where q.id = responses.questionnaire_id and q.admin_id = auth.uid()
    )
  );

create policy "clients view own responses"
  on public.responses for select
  using (user_id = auth.uid());

create policy "clients insert own responses"
  on public.responses for insert
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- resources
-- ─────────────────────────────────────────────────────────────
alter table public.resources
  add column if not exists admin_id uuid references auth.users(id) on delete cascade;

update public.resources
  set admin_id = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where admin_id is null;

alter table public.resources alter column admin_id set not null;

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'resources'
  loop
    execute format('drop policy %I on public.resources', pol);
  end loop;
end $$;

create policy "admins manage own resources"
  on public.resources for all
  using (admin_id = auth.uid());

-- clients see published resources from their own admin only
create policy "clients view published resources"
  on public.resources for select
  using (
    is_published = true
    and admin_id = (
      select u.admin_id from public.users u where u.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- tags
-- ─────────────────────────────────────────────────────────────
alter table public.tags
  add column if not exists admin_id uuid references auth.users(id) on delete cascade;

update public.tags
  set admin_id = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where admin_id is null;

alter table public.tags alter column admin_id set not null;

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tags'
  loop
    execute format('drop policy %I on public.tags', pol);
  end loop;
end $$;

create policy "admins manage own tags"
  on public.tags for all
  using (admin_id = auth.uid());

create policy "clients view tags via assigned questions"
  on public.tags for select
  using (
    exists (
      select 1
      from public.questions qu
      join public.questionnaire_assignments qa
        on qa.questionnaire_id = qu.questionnaire_id
      where qu.tag_id = tags.id
        and qa.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- users  (clients get admin_id; admin rows stay null)
-- ─────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists admin_id uuid references auth.users(id) on delete set null;

update public.users
  set admin_id = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where role = 'client' and admin_id is null;

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'users'
  loop
    execute format('drop policy %I on public.users', pol);
  end loop;
end $$;

-- every user sees their own row
create policy "users view own row"
  on public.users for select
  using (id = auth.uid());

create policy "users update own row"
  on public.users for update
  using (id = auth.uid());

-- admin sees their clients
create policy "admins view own clients"
  on public.users for select
  using (admin_id = auth.uid());

create policy "admins update own clients"
  on public.users for update
  using (admin_id = auth.uid() and role = 'client');

-- admin sees other admin accounts (for the user management page)
-- get_my_role() is security definer so it bypasses RLS — no recursion
create policy "admins view other admin accounts"
  on public.users for select
  using (
    role = 'admin'
    and (select public.get_my_role()) = 'admin'
  );

-- ─────────────────────────────────────────────────────────────
-- sessions  (created_by already exists — backfill + enforce RLS)
-- ─────────────────────────────────────────────────────────────
update public.sessions
  set created_by = '02ad9950-0eee-4754-aa7f-6677ba578f18'
  where created_by is null;

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
  loop
    execute format('drop policy %I on public.sessions', pol);
  end loop;
end $$;

create policy "admins manage own sessions"
  on public.sessions for all
  using (created_by = auth.uid());

create policy "clients view own sessions"
  on public.sessions for select
  using (client_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- session_events  (inherits via sessions.created_by)
-- ─────────────────────────────────────────────────────────────
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'session_events'
  loop
    execute format('drop policy %I on public.session_events', pol);
  end loop;
end $$;

create policy "admins view own session events"
  on public.session_events for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_events.session_id and s.created_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- reschedule_requests  (admin inherits via sessions.created_by)
-- ─────────────────────────────────────────────────────────────
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'reschedule_requests'
  loop
    execute format('drop policy %I on public.reschedule_requests', pol);
  end loop;
end $$;

create policy "admins manage own reschedule requests"
  on public.reschedule_requests for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = reschedule_requests.session_id and s.created_by = auth.uid()
    )
  );

create policy "clients insert own reschedule requests"
  on public.reschedule_requests for insert
  with check (client_id = auth.uid());

create policy "clients view own reschedule requests"
  on public.reschedule_requests for select
  using (client_id = auth.uid());
