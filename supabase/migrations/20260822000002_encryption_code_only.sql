-- Removes the password-unlock layer from note encryption entirely. Encrypted
-- notes were previously unlockable two ways: the 4-word code, or the admin's
-- own login password (which decrypted a stored copy of the code). That
-- second path meant anyone who could log in as the admin could also read
-- every note without ever knowing the code — the code added nothing. From
-- now on the code is the only way in; see the updated architecture comment
-- in src/lib/noteEncryption.ts.
--
-- enc_code_wrapped/enc_code_salt/enc_code_iv wrapped the code under a
-- password-derived key — with the password layer gone, they're dead weight.
alter table public.practice_settings
  drop column if exists enc_code_wrapped,
  drop column if exists enc_code_salt,
  drop column if exists enc_code_iv;

-- Full reset, requested explicitly with only test accounts on the platform
-- at the time: every admin's encryption gets set up fresh (new code, new
-- data key) next time they open a client's notes, and every existing
-- session note / account summary is cleared rather than left encrypted
-- under a data key nothing can unwrap anymore.
update public.practice_settings
set enc_data_key = null,
    enc_data_key_salt = null,
    enc_data_key_iv = null;

delete from public.session_notes;
