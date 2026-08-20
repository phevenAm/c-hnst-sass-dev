-- Lets an admin re-prompt a client for a non-recurring (frequency IS NULL)
-- outcome measure without deleting/recreating the assignment. CheckInPage's
-- "due" check treats a one-time form as done forever once it has a response;
-- setting prompt_again_at (to a time after the client's latest response)
-- makes it show as outstanding again until they resubmit.
alter table public.questionnaire_assignments
  add column prompt_again_at timestamptz;
