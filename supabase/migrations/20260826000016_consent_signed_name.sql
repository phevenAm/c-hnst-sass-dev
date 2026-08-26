-- Adds a lightweight e-signature to the client consent flow: alongside the
-- existing checkbox, the client now types their name to confirm agreement.
-- Stored so the agreement (title/body/PDF + who signed it and when) can be
-- revisited later from the client's Resources page.
alter table public.users add column if not exists consent_signed_name text;
