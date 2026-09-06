-- Consent cannot be enabled without content clients can read and agree to.
UPDATE public.practice_settings
SET consent_enabled = false
WHERE consent_enabled
  AND (nullif(trim(consent_title), '') IS NULL OR nullif(trim(consent_body), '') IS NULL);

ALTER TABLE public.practice_settings
  ADD CONSTRAINT practice_settings_consent_requires_content
  CHECK (
    NOT consent_enabled
    OR (nullif(trim(consent_title), '') IS NOT NULL AND nullif(trim(consent_body), '') IS NOT NULL)
  );
