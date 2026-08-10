-- created_by had no DEFAULT, so PostgREST inserts without it failed the
-- USING (created_by = auth.uid()) RLS check. Setting auth.uid() as the
-- default means the DB fills it in automatically on every insert.
alter table public.client_stubs
  alter column created_by set default auth.uid();
