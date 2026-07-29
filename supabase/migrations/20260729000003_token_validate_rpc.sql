-- Sign-up token validation without exposing the token table.
--
-- platform_access_token has RLS ("admins manage own access tokens"), so an
-- admin can only see their OWN tokens. That's correct — but the sign-up flow
-- runs as an anonymous user and needs to check a token BEFORE an account
-- exists. We must NOT open the table to anon (that would let anyone list every
-- practice's tokens and sign up under someone else's practice — cross-practice
-- bleed). A security-definer function lets an anonymous signer verify ONE
-- specific token (boolean only), never reading the table directly.
--
-- The token stays bound to its creating admin via platform_access_token.admin_id;
-- consume_platform_access_token then links the new client to THAT admin. So a
-- token made by counsellor A can only ever enrol a client into A's practice.

-- Fix a schema bug first: expires_at was created as `time` (time-of-day), so
-- `expires_at > now()` is a type error (time vs timestamptz). No code ever
-- writes expires_at — tokens are single-use via is_used, so every value is
-- null — and it's safe to correct the type. This also fixes the same latent
-- comparison inside consume_platform_access_token.
alter table public.platform_access_token
  alter column expires_at type timestamptz using null::timestamptz;

create or replace function public.validate_platform_access_token(input_token text)
returns boolean
language sql
security definer
set search_path = public
stable
as $func$
  select exists (
    select 1
    from public.platform_access_token
    where token = input_token
      and (is_used is null or is_used = false)
      and (expires_at is null or expires_at > now())
  );
$func$;

grant execute on function public.validate_platform_access_token(text) to anon, authenticated;
