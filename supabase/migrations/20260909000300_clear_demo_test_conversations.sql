-- ─────────────────────────────────────────────────────────────────────────────
-- Delete the real message threads created against the demo practice while
-- testing. The demo UI now shows a scripted, in-memory Cassie <-> Amanda
-- conversation (src/store/slices/demoMessages.ts) and never reads or writes
-- these tables, so the persisted rows are just leftover test data.
--
-- messages.conversation_id is ON DELETE CASCADE, so removing the conversation
-- rows takes their messages with them. Demo write-guard triggers key off
-- auth.uid() (null in a migration), so this runs.
-- ─────────────────────────────────────────────────────────────────────────────

delete from public.conversations
where admin_id  in ('63aeb602-0056-4217-b120-9b6dc0c7c649', '3d5e1d85-d7c6-4573-b61e-91d19daa07bb')
   or client_id in ('63aeb602-0056-4217-b120-9b6dc0c7c649', '3d5e1d85-d7c6-4573-b61e-91d19daa07bb');
