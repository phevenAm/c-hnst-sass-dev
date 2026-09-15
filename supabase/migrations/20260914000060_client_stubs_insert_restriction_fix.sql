-- Fix for 20260914000040: "agency managers act for members" is a FOR ALL
-- policy on client_stubs using acts_for_admin(created_by), and
-- acts_for_admin(p) is true whenever the caller IS p (self) — so it
-- independently re-granted the exact self-directed INSERT that
-- "admins insert own stubs" was written to block, since RLS policies are
-- OR'd. Caught by e2e/agency/agency.spec.ts's new client_stubs INSERT test.
--
-- Splits that policy so INSERT only applies to the actual manager-acting-
-- for-someone-else case (created_by <> auth.uid()) — a manager creating an
-- intake stub for themselves is still covered by "admins insert own stubs"
-- (which already correctly allows managers, just not counsellors). SELECT/
-- UPDATE/DELETE are untouched.
drop policy if exists "agency managers act for members" on client_stubs;

create policy "agency managers act for members select"
  on client_stubs for select
  using (acts_for_admin(created_by));

create policy "agency managers act for members update"
  on client_stubs for update
  using (acts_for_admin(created_by))
  with check (acts_for_admin(created_by));

create policy "agency managers act for members delete"
  on client_stubs for delete
  using (acts_for_admin(created_by));

create policy "agency managers insert for other members"
  on client_stubs for insert
  with check (created_by <> auth.uid() and acts_for_admin(created_by));

notify pgrst, 'reload schema';
