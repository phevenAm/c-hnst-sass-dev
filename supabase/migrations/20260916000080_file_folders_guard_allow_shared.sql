-- Fix: file_folders_guard_columns() blocked `shared` from ever being changed
-- by a regular authenticated client — found live via e2e while building the
-- first-ever frontend control to toggle it (this same session).
-- 20260910100000_file_manager_hardening.sql locked owner_admin_id, agency_id
-- AND shared down together, five days before 20260915000030 added
-- shared_internal/shared_freelance and made `shared` a real, user-facing
-- toggle — the two migrations never reconciled, so the intended feature was
-- unreachable from day one via any authenticated update. The sibling
-- file_objects_guard_columns() already gets this right (its error message
-- literally says "shared ... editable") — this brings file_folders in line
-- with it: still locked are owner_admin_id and agency_id (who owns it and
-- which agency it counts against must never move), shared is not.
create or replace function public.file_folders_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if auth.uid() is null then          -- service role / definer context
    return new;
  end if;
  if new.owner_admin_id is distinct from old.owner_admin_id
     or new.agency_id   is distinct from old.agency_id then
    raise exception 'FOLDER_IMMUTABLE_COLUMN: only name, location and shared can be changed';
  end if;
  return new;
end;
$func$;

notify pgrst, 'reload schema';
