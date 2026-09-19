-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: infinite RLS recursion on the Groups tables (found live via e2e, first
-- real exercise of 20260916000040_agency_groups.sql).
--
-- Postgres combines multiple permissive policies on a table with OR and has to
-- evaluate every one of them, even once an earlier policy already matched —
-- it doesn't short-circuit. groups' "staff read groups they facilitate"
-- policy did `exists (select 1 from group_staff where group_id = groups.id
-- and user_id = auth.uid())`; group_staff's own "managers manage" policy did
-- `exists (select 1 from groups g where g.id = group_staff.group_id and
-- ...)` right back into groups. Any select on either table re-triggers the
-- other table's RLS, which re-triggers the first, forever —
-- "infinite recursion detected in policy for relation groups".
--
-- Fix: the same trick current_agency_id()/is_agency_manager()/acts_for_admin()
-- already use elsewhere in this schema — move the cross-table lookup into a
-- security definer function. Called from inside a policy, its internal query
-- runs as the function's own (elevated) role and does not re-trigger RLS on
-- the table it reads, breaking the cycle.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.group_agency_id(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $func$
  select agency_id from public.groups where id = p_group_id;
$func$;

create or replace function public.is_group_staff(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from public.group_staff
    where group_id = p_group_id and user_id = auth.uid()
  );
$func$;

revoke execute on function public.group_agency_id(uuid) from anon;
grant  execute on function public.group_agency_id(uuid) to authenticated;
revoke execute on function public.is_group_staff(uuid) from anon;
grant  execute on function public.is_group_staff(uuid) to authenticated;

-- groups: replace the inline group_staff lookup with the helper.
drop policy "staff read groups they facilitate" on public.groups;
create policy "staff read groups they facilitate" on public.groups
  for select to authenticated
  using (public.is_group_staff(groups.id));

-- group_members: replace both inline groups/group_staff lookups.
drop policy "managers manage agency group members" on public.group_members;
create policy "managers manage agency group members" on public.group_members
  for all to authenticated
  using (public.group_agency_id(group_members.group_id) = public.current_agency_id() and public.is_agency_manager())
  with check (
    public.group_agency_id(group_members.group_id) = public.current_agency_id() and public.is_agency_manager()
  );

drop policy "staff read members of groups they facilitate" on public.group_members;
create policy "staff read members of groups they facilitate" on public.group_members
  for select to authenticated
  using (public.is_group_staff(group_members.group_id));

-- group_staff: replace the inline groups lookup. Its other policy ("staff
-- read own group facilitation rows", user_id = auth.uid()) has no cross-table
-- reference and was never part of the cycle — left as-is.
drop policy "managers manage agency group staff" on public.group_staff;
create policy "managers manage agency group staff" on public.group_staff
  for all to authenticated
  using (public.group_agency_id(group_staff.group_id) = public.current_agency_id() and public.is_agency_manager())
  with check (
    public.group_agency_id(group_staff.group_id) = public.current_agency_id() and public.is_agency_manager()
  );

notify pgrst, 'reload schema';
