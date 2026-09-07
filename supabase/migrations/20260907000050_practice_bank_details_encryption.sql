-- ─────────────────────────────────────────────────────────────────────────────
-- Encrypt practice_settings.bank_* at rest with pgcrypto, keyed from Vault.
--
-- These columns hold bank-transfer payment instructions (sort code, account
-- number, reference, …). They are read by three kinds of caller:
--   • the owning admin           — Settings, invoice PDF
--   • that admin's own clients   — PaymentModal "how to pay"
--   • the send-invoice-email fn  — service role
-- so they can't be end-to-end encrypted (a client holds no key). Instead the
-- ciphertext lives in the column and a SECURITY DEFINER function decrypts it
-- *inside Postgres* for callers who are allowed to see it. The key never
-- leaves the database.
--
-- This supersedes the old client-side encryptPII() path, which either stored
-- plaintext silently (AdminSetupPage, when no note-encryption key was set up)
-- or stored a {c,iv} blob that the client-facing PaymentModal then rendered
-- raw.
--
-- ROLLOUT — this migration is deliberately ADDITIVE and touches no existing
-- data. Nothing breaks if it lands before the frontend catches up:
--   1. (this file) add the key + get_/set_practice_bank_details functions.
--   2. frontend: read via get_practice_bank_details(admin_id), write via
--      set_practice_bank_details(...). Direct column selects keep working —
--      they just return ciphertext once a row has been (re)saved.
--   3. edge fn send-invoice-email: read via the RPC too.
--   4. later migration: one-off sweep to encrypt rows never re-saved.
-- get_practice_bank_details tolerates both plaintext and ciphertext, so
-- steps can ship in any order without a flag-day.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- 32-byte random key, base64, in Vault (same pattern as 20260826000014).
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'base64'),
  'practice_bank_enc_key',
  'pgp_sym key for practice_settings.bank_* columns'
) where not exists (select 1 from vault.secrets where name = 'practice_bank_enc_key');

-- ── internal helpers (not callable by API roles) ────────────────────────────
create or replace function public._bank_enc_key()
returns text language sql stable security definer set search_path = '' as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = 'practice_bank_enc_key'
$fn$;
revoke all on function public._bank_enc_key() from public, anon, authenticated;

-- Idempotent: already-armored input is returned unchanged, so the future
-- data sweep can call this over every row without double-encrypting.
create or replace function public._bank_encrypt(p text)
returns text language sql volatile security definer set search_path = '' as $fn$
  select case
    when p is null or p = '' then null
    when left(p, 27) = '-----BEGIN PGP MESSAGE-----' then p
    else extensions.armor(extensions.pgp_sym_encrypt(p, public._bank_enc_key()))
  end
$fn$;
revoke all on function public._bank_encrypt(text) from public, anon, authenticated;

-- Passes plaintext (and the legacy {c,iv} blob) straight through; only
-- un-armors real pgcrypto ciphertext. Never throws — worst case the caller
-- gets back exactly what's in the column.
create or replace function public._bank_decrypt(p text)
returns text language plpgsql stable security definer set search_path = '' as $fn$
begin
  if p is null or p = '' then
    return null;
  end if;
  if left(p, 27) <> '-----BEGIN PGP MESSAGE-----' then
    return p;
  end if;
  return extensions.pgp_sym_decrypt(extensions.dearmor(p), public._bank_enc_key());
exception when others then
  return p;
end
$fn$;
revoke all on function public._bank_decrypt(text) from public, anon, authenticated;

-- ── read: owning admin OR one of that admin's clients ──────────────────────
create or replace function public.get_practice_bank_details(p_admin_id uuid)
returns table (
  bank_name              text,
  bank_account_name      text,
  bank_sort_code         text,
  bank_account_number    text,
  bank_payment_reference text
)
language sql stable security definer set search_path = '' as $fn$
  select
    public._bank_decrypt(ps.bank_name),
    public._bank_decrypt(ps.bank_account_name),
    public._bank_decrypt(ps.bank_sort_code),
    public._bank_decrypt(ps.bank_account_number),
    public._bank_decrypt(ps.bank_payment_reference)
  from public.practice_settings ps
  where ps.admin_id = p_admin_id
    and (
      auth.uid() = p_admin_id
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.admin_id = p_admin_id
      )
    )
$fn$;
revoke all on function public.get_practice_bank_details(uuid) from public, anon;
grant execute on function public.get_practice_bank_details(uuid) to authenticated;

-- ── write: only the owning admin, values encrypted on the way in ───────────
create or replace function public.set_practice_bank_details(
  p_bank_name              text,
  p_bank_account_name      text,
  p_bank_sort_code         text,
  p_bank_account_number    text,
  p_bank_payment_reference text
)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.practice_settings set
    bank_name              = public._bank_encrypt(nullif(btrim(p_bank_name), '')),
    bank_account_name      = public._bank_encrypt(nullif(btrim(p_bank_account_name), '')),
    bank_sort_code         = public._bank_encrypt(nullif(btrim(p_bank_sort_code), '')),
    bank_account_number    = public._bank_encrypt(nullif(btrim(p_bank_account_number), '')),
    bank_payment_reference = public._bank_encrypt(nullif(btrim(p_bank_payment_reference), ''))
  where admin_id = auth.uid();

  if not found then
    raise exception 'No practice_settings row for %', auth.uid();
  end if;
end
$fn$;
revoke all on function public.set_practice_bank_details(text, text, text, text, text) from public, anon;
grant execute on function public.set_practice_bank_details(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
