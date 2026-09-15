-- Let a supervision private event's cost show up as a matching row in the
-- expenses ledger. One-to-one via a unique FK: the frontend upserts on
-- conflict (source_private_event_id) when "add to expenses" is ticked, and
-- deleting the private event cascades to remove its linked expense so there's
-- never an orphaned entry left behind.
alter table public.expenses
  add column if not exists source_private_event_id uuid
    references public.admin_private_events(id) on delete cascade unique;

notify pgrst, 'reload schema';
