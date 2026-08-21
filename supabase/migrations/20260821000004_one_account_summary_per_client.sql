-- Account Summary (session_notes rows with session_id IS NULL) was built on
-- the same "open-ended list" model as per-session notes — every click of
-- "Add" in SessionNotesModal inserted a new row, so a client's account
-- summary could accumulate multiple entries over time with no way to tell
-- which one was current. It's meant to be a single running summary per
-- client, not a log.
--
-- Clean up existing duplicates first (found 3 clients with 2 rows each),
-- keeping the most recent — that's the row the current UI already surfaces
-- via ORDER BY created_at DESC LIMIT 1 (AdminClientsPageDetailed's preview)
-- — then enforce it going forward with a partial unique index so this can't
-- silently reoccur regardless of what future code touches this table.
--
-- Scoped to real clients (user_id) only — stub/offline clients don't have
-- an Account Summary entry point in the UI today.
delete from public.session_notes sn
using (
  select id,
    row_number() over (partition by user_id order by created_at desc) as rn
  from public.session_notes
  where session_id is null and user_id is not null
) ranked
where sn.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists session_notes_one_account_summary_per_user
  on public.session_notes (user_id)
  where session_id is null and user_id is not null;
