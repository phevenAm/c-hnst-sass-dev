-- Per-practice switch for the session "reference" field (the free-text code
-- an admin can put on a session — an invoice number, case ref, etc.).
-- Practices that don't file sessions that way can hide the affordance.
--
-- Default true = current behaviour (the "+ reference" button shows).
alter table public.practice_settings
  add column if not exists show_session_reference boolean not null default true;

comment on column public.practice_settings.show_session_reference is
  'When false, hides the per-session reference/code field on session cards.';

notify pgrst, 'reload schema';
