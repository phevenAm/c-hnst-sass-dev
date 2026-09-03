-- Archive state for forms / outcome measures.
--
-- "Pause" (is_active = false) is a workflow state — stop assigning it for now.
-- Archiving is "I'm done with this one" — it drops out of the main Forms list
-- into a collapsed "Archived" section so the list stays manageable. Existing
-- assignments and responses are untouched; unarchiving brings it straight back.
alter table public.questionnaires
  add column if not exists archived_at timestamptz;

-- The "admins manage own questionnaires" policy (FOR ALL, admin_id = auth.uid())
-- already covers updating this column from the client.
