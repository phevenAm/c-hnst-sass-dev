-- Client-side note encryption support.
-- The actual encryption happens in the browser; the DB only stores ciphertext.
-- note_enc_key:     data key wrapped with a KEK derived from the admin's password (base64 AES-GCM ciphertext)
-- note_enc_salt:    PBKDF2 salt used to derive all KEKs for this practice (base64)
-- note_enc_key_iv:  IV used when wrapping the data key with the password KEK (base64)
-- note_enc_rec_key: same data key wrapped with a KEK derived from the recovery code
-- note_enc_rec_iv:  IV for the recovery-code wrapping

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS note_enc_key     text,
  ADD COLUMN IF NOT EXISTS note_enc_salt    text,
  ADD COLUMN IF NOT EXISTS note_enc_key_iv  text,
  ADD COLUMN IF NOT EXISTS note_enc_rec_key text,
  ADD COLUMN IF NOT EXISTS note_enc_rec_iv  text;

-- Encryption metadata per note.
-- is_encrypted: false = content is plaintext (legacy), true = content is base64 AES-GCM ciphertext
-- note_iv:      per-note IV used during AES-GCM encryption (base64, present only when is_encrypted = true)

ALTER TABLE session_notes
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_iv      text;
