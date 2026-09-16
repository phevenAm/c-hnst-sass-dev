-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: sharing a folder didn't share what's inside it.
--
-- Found live (Stephen: "staff still can't see files"). file_folders and
-- file_objects each carry their OWN `shared` boolean, and the read RLS
-- (file_shared_with_caller, see 20260915000030) only ever checks a row's own
-- flag — it has no idea about a parent folder. There was also, until this
-- same session, no frontend control to set `shared` at all (see the FE
-- change alongside this migration), so nothing had ever been shared in
-- practice; this cascade is what makes "share this folder" behave the way a
-- manager actually expects once that control exists.
--
-- Mirrors the existing file_folder_cascade_paths() trigger exactly (same
-- recursive-CTE shape, same reasoning: re-materialise a derived value across
-- a subtree in one write rather than make the frontend walk it row by row).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.file_folder_cascade_shared()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if old.shared is distinct from new.shared then
    with recursive sub as (
      select f.id from public.file_folders f where f.parent_id = new.id
      union all
      select f.id from public.file_folders f join sub s on f.parent_id = s.id
    )
    update public.file_folders f
       set shared = new.shared, updated_at = now()
      from sub s
     where f.id = s.id
       and f.shared is distinct from new.shared;

    with recursive sub as (
      select new.id as id
      union all
      select f.id from public.file_folders f
        join sub s on f.parent_id = s.id
    )
    update public.file_objects o
       set shared = new.shared, updated_at = now()
      from sub s
     where o.folder_id = s.id
       and o.shared is distinct from new.shared;
  end if;
  return null;
end;
$func$;

drop trigger if exists file_folders_50_cascade_shared on public.file_folders;
create trigger file_folders_50_cascade_shared
  after update on public.file_folders
  for each row execute function public.file_folder_cascade_shared();

notify pgrst, 'reload schema';
