-- Ensure admins can SELECT and UPDATE their own practice_settings row.
-- The original table was set up before migrations were tracked, and only
-- an INSERT policy was ever explicitly added (20260806000003). Without an
-- UPDATE policy the upsert in setupEncryption silently writes nothing and
-- the encryption key never persists.

DO $func$
BEGIN
  -- SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'practice_settings'
      AND cmd        = 'SELECT'
      AND policyname = 'admins select own practice_settings'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "admins select own practice_settings"
        ON public.practice_settings
        FOR SELECT
        TO authenticated
        USING (admin_id = auth.uid())
    $pol$;
  END IF;

  -- UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'practice_settings'
      AND cmd        = 'UPDATE'
      AND policyname = 'admins update own practice_settings'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "admins update own practice_settings"
        ON public.practice_settings
        FOR UPDATE
        TO authenticated
        USING    (admin_id = auth.uid())
        WITH CHECK (admin_id = auth.uid())
    $pol$;
  END IF;
END $func$;
