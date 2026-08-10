-- Encryption architecture rewrite.
--
-- Old system: data key wrapped directly with password-derived KEK.
--   Problem: any password change or reset permanently locks notes.
--
-- New system: two-layer envelope.
--   enc_code        = random 4-word code, generated once, never changes.
--   data key        = random AES-256 key that encrypts all notes.
--   enc_data_key    = data key wrapped with PBKDF2(enc_code, enc_data_key_salt).
--   enc_code_wrapped = enc_code encrypted with PBKDF2(password, enc_code_salt).
--
--   Password change  → re-wrap enc_code with new password. Data key untouched.
--   Code regeneration → re-wrap data key with new code. Re-wrap new code with password.
--   Password reset    → user enters code directly to unlock data key, then relinks code to new password.

-- Remove old columns
ALTER TABLE practice_settings
  DROP COLUMN IF EXISTS note_enc_key,
  DROP COLUMN IF EXISTS note_enc_salt,
  DROP COLUMN IF EXISTS note_enc_key_iv,
  DROP COLUMN IF EXISTS note_enc_rec_key,
  DROP COLUMN IF EXISTS note_enc_rec_iv;

-- Add new columns
ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS enc_code_wrapped    text,
  ADD COLUMN IF NOT EXISTS enc_code_salt       text,
  ADD COLUMN IF NOT EXISTS enc_code_iv         text,
  ADD COLUMN IF NOT EXISTS enc_data_key        text,
  ADD COLUMN IF NOT EXISTS enc_data_key_salt   text,
  ADD COLUMN IF NOT EXISTS enc_data_key_iv     text;

-- Delete all encrypted notes — they were encrypted with the old incompatible keys.
-- All test data; no real client notes exist.
DELETE FROM session_notes WHERE is_encrypted = true;
