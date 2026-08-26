-- Same bug as 20260818000000_resources_admin_id_default.sql and
-- 20260818000001_questionnaires_admin_id_default.sql: tags.admin_id is
-- NOT NULL with no default, and createTag's insert payload only ever sends
-- { name } — every tag creation silently fails with a 23502 (not-null
-- violation) before RLS is even evaluated. Stamp admin_id server-side, same
-- fix as the two sibling tables.
alter table public.tags alter column admin_id set default auth.uid();
