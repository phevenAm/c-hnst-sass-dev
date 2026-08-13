-- Add DEFAULT NOW() to questionnaire_assignments.assigned_at
-- and backfill any existing null values.
alter table public.questionnaire_assignments
  alter column assigned_at set default now();

update public.questionnaire_assignments
  set assigned_at = now()
  where assigned_at is null;
