-- Admins can pin a resource (or document) so it sorts first within its tab,
-- on both the admin Resources page and the client Resources page.
-- Existing RLS on public.resources already covers the new column.

alter table public.resources
  add column if not exists is_pinned boolean not null default false;

notify pgrst, 'reload schema';
