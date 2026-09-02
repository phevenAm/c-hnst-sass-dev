-- ─────────────────────────────────────────────────────────────────────────────
-- Agencies, part 4 of 5: manager cross-member visibility.
--
-- Adds ONE extra permissive policy per client-facing tenant table:
--   using (public.acts_for_admin(<owner col>))
--
-- Permissive policies OR together, so every existing "admin_id = auth.uid()"
-- rule is untouched — a non-agency user's access is byte-for-byte unchanged
-- (acts_for_admin() returns false for them). An active agency MANAGER
-- additionally reaches every row owned by a member admin in their agency.
--
-- Deliberately NOT widened: practice_settings (bank details, encryption key
-- material — agency-level policy is read from public.agencies instead),
-- cpd_logs / supervision_sessions (a counsellor's personal PD record, not
-- agency business). session_notes is SELECT-only here: a manager sees that a
-- note exists but client-side-encrypted bodies stay unreadable — no key sharing.
--
-- acts_for_admin(NULL) is false (admin rows have admin_id = NULL), so the
-- users policy exposes member CLIENTS only, never member admin accounts.
-- ─────────────────────────────────────────────────────────────────────────────

do $mig$
declare
  r record;
begin
  for r in
    select * from (values
      ('users',                    'for all',    'public.acts_for_admin(admin_id)'),
      ('client_stubs',             'for all',    'public.acts_for_admin(created_by)'),
      ('sessions',                 'for all',    'public.acts_for_admin(created_by)'),
      ('stub_sessions',            'for all',    'public.acts_for_admin(admin_id)'),
      ('payments',                 'for all',    'public.acts_for_admin(admin_id)'),
      ('resources',                'for all',    'public.acts_for_admin(admin_id)'),
      ('questionnaires',           'for all',    'public.acts_for_admin(admin_id)'),
      ('session_notes',            'for select', 'public.acts_for_admin(admin_id)'),
      ('responses',                'for select',
         'exists (select 1 from public.questionnaires q where q.id = responses.questionnaire_id and public.acts_for_admin(q.admin_id))'),
      ('questionnaire_assignments','for all',
         'exists (select 1 from public.questionnaires q where q.id = questionnaire_assignments.questionnaire_id and public.acts_for_admin(q.admin_id))'),
      ('questions',                'for all',
         'exists (select 1 from public.questionnaires q where q.id = questions.questionnaire_id and public.acts_for_admin(q.admin_id))'),
      ('session_events',           'for select',
         'exists (select 1 from public.sessions s where s.id = session_events.session_id and public.acts_for_admin(s.created_by))'),
      ('reschedule_requests',      'for all',
         'exists (select 1 from public.sessions s where s.id = reschedule_requests.session_id and public.acts_for_admin(s.created_by))')
    ) as t(tbl, cmd, predicate)
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = r.tbl
        and policyname  = 'agency managers act for members'
    ) then
      if r.cmd = 'for all' then
        execute format(
          'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
          'agency managers act for members', r.tbl, r.predicate, r.predicate
        );
      else
        execute format(
          'create policy %I on public.%I %s to authenticated using (%s)',
          'agency managers act for members', r.tbl, r.cmd, r.predicate
        );
      end if;
    end if;
  end loop;
end $mig$;

notify pgrst, 'reload schema';
