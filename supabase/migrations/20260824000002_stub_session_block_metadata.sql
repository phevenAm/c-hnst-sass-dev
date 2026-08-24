-- Offline (stub) client sessions never got the `metadata` column real
-- sessions have, so bulk/recurring stub bookings couldn't be tagged with a
-- shared block_id — the block-grouping UI (groupSessionsForDisplay) has
-- never had anything to group for offline clients. Adding it to bring stub
-- sessions to parity with real sessions.
alter table public.stub_sessions
  add column if not exists metadata jsonb;
