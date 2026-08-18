-- resources.admin_id has no default, so any insert that omits it (the
-- AdminResourcesPage form never sends admin_id) lands as null and gets
-- silently blocked by the "admins manage own resources" RLS policy
-- (admin_id = auth.uid()), surfacing as 42501 rather than a clear error.
--
-- Same class of bug fixed for platform_access_token in
-- 20260813000004_stub_invite_merge_fixes.sql. Stamp admin_id server-side
-- so inserts are self-sufficient, matching the pattern already used for
-- public.payments (20260810000002_payments_table.sql).

alter table public.resources
  alter column admin_id set default auth.uid();
