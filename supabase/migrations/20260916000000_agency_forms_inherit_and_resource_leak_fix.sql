-- ─────────────────────────────────────────────────────────────────────────────
-- Two fixes, both additive/narrowing only:
--
-- A. Remove the dormant "agency managers act for members" widening on
--    `resources`. Nothing in the app ever used a manager's ability to read/
--    write a colleague's resources (no /agency/* page exists for it), so its
--    only real effect was a data leak: fetchResources() (used exclusively by
--    the personal /admin/resources page) relied on RLS with no admin_id
--    filter, so a manager's OWN resources page silently mixed in every
--    colleague's resources. The FE fix (scoping fetchResources to admin_id
--    OR the shared-from-manager case) already shipped; this closes the same
--    hole at the RLS layer so it can't be bypassed by calling the table
--    directly. Solo admins and staff (via agency_shares_resources(), added
--    2026-09-15) are unaffected.
--
-- B. Staff inherit the agency's shared FORMS the same way they already
--    inherit shared resources (agency_shares_resources(), 2026-09-15) — a
--    new SELECT-ONLY policy on `questionnaires`/`questions`, so staff can
--    see but never edit a manager's forms. Deliberately does NOT touch
--    `questionnaire_assignments` — that table and `questionnaires` already
--    have a mutual policy reference (questionnaires' own "clients view
--    assigned questionnaires" policy queries questionnaire_assignments, and
--    the base "admins manage own questionnaire assignments" policy queries
--    questionnaires back), and layering a THIRD interdependent policy on
--    top of that pair is exactly what caused a real prod outage once
--    (20260902010006_agency_rls_hotfix_recursion.sql — "infinite recursion
--    detected in policy"). A staff member assigning an inherited form to
--    their own client goes through assign_agency_questionnaire() below
--    instead — a SECURITY DEFINER RPC bypasses RLS entirely for its own
--    internal writes, so it can deliver the capability with zero risk of
--    re-triggering that recursion class of bug.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Resources: drop the unused, leak-causing manager widening ───────────
drop policy if exists "agency managers act for members" on public.resources;

-- ── B. Staff inherit the manager's shared forms (read-only) ───────────────
drop policy if exists "staff read agency shared questionnaires" on public.questionnaires;
create policy "staff read agency shared questionnaires" on public.questionnaires for select to authenticated
  using (public.agency_shares_resources(admin_id));

drop policy if exists "staff read agency shared questions" on public.questions;
create policy "staff read agency shared questions" on public.questions for select to authenticated
  using (
    exists (
      select 1 from public.questionnaires q
      where q.id = questions.questionnaire_id and public.agency_shares_resources(q.admin_id)
    )
  );

-- Lets a non-manager staff member dispatch a form they've inherited from
-- their agency manager (agency_shares_resources()) to one of their OWN
-- clients, without granting any new raw RLS on questionnaire_assignments.
-- Everything inside runs as the function owner (security definer), so these
-- queries never re-enter questionnaires/questionnaire_assignments RLS.
create or replace function public.assign_agency_questionnaire(p_questionnaire_id uuid, p_client_id uuid)
returns public.questionnaire_assignments
language plpgsql security definer set search_path = ''
as $func$
declare
  v_owner uuid;
  v_result public.questionnaire_assignments;
begin
  select admin_id into v_owner from public.questionnaires where id = p_questionnaire_id;
  if v_owner is null then
    raise exception 'FORM_NOT_FOUND: no such questionnaire';
  end if;
  if not public.agency_shares_resources(v_owner) then
    raise exception 'FORM_NOT_SHARED: this form is not shared with you by your agency';
  end if;
  if not exists (select 1 from public.users where id = p_client_id and admin_id = auth.uid()) then
    raise exception 'CLIENT_NOT_YOURS: that client is not assigned to you';
  end if;

  insert into public.questionnaire_assignments (questionnaire_id, user_id)
  values (p_questionnaire_id, p_client_id)
  returning * into v_result;

  return v_result;
end;
$func$;

revoke all on function public.assign_agency_questionnaire(uuid, uuid) from public, anon;
grant execute on function public.assign_agency_questionnaire(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
