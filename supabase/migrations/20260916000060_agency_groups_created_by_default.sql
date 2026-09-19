-- Same bug as 20260810000001_stub_created_by_default.sql, found live via e2e
-- on the first real "create group" attempt: groups.created_by had no
-- DEFAULT, so the frontend insert (which never sends created_by — it's an
-- audit field, not user input) failed the not-null constraint. Setting
-- auth.uid() as the default fills it in automatically on every insert,
-- matching client_stubs' established convention.
alter table public.groups
  alter column created_by set default auth.uid();

notify pgrst, 'reload schema';
