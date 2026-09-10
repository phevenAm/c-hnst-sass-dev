-- Agency co-members can read each other's name.
--
-- The agency members list (fetchAgencyMembers) reads agency_members and then
-- joins names from public.users. But public.users RLS is per-practice
-- (admin_id) — a manager can't SELECT the users row of staff who belong to a
-- different practice, so freelance / cross-practice members render as just
-- "Member". public.users.agency_id already mirrors the active membership
-- (stamped by consume_agency_invite / create-agency, cleared on removal), so
-- this is a cheap column check — no join, and current_agency_id() is
-- SECURITY DEFINER so there's no recursion back through agency_members RLS.

do $func$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'agency co-members read profiles'
  ) then
    execute $pol$
      create policy "agency co-members read profiles" on public.users
        for select to authenticated
        using (agency_id is not null and agency_id = public.current_agency_id())
    $pol$;
  end if;
end $func$;

notify pgrst, 'reload schema';
