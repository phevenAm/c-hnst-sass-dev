-- practice_settings must have a UNIQUE constraint on admin_id so that
-- upsert (INSERT ... ON CONFLICT DO UPDATE) works from the browser client.
-- Without it PostgREST returns "no unique constraint matching ON CONFLICT"
-- and the encryption key silently never persists.

-- Deduplicate first (keep the row with the highest ctid, i.e. latest insert).
DELETE FROM public.practice_settings
WHERE ctid NOT IN (
  SELECT max(ctid)
  FROM   public.practice_settings
  GROUP  BY admin_id
);

ALTER TABLE public.practice_settings
  ADD CONSTRAINT practice_settings_admin_id_key UNIQUE (admin_id);
