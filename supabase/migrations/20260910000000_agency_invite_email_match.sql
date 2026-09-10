-- ─────────────────────────────────────────────────────────────────────────────
-- Agency invites: bind consumption to the invited email address.
--
-- Until now consume_agency_invite() attached WHOEVER was authenticated when it
-- ran, on possession of the (random) token alone — the same trust model as
-- validate_platform_access_token. But the platform token gates *creating a new
-- account*, whereas this one attaches an *arbitrary existing signed-in account*
-- to the agency (agency_members row + users.agency_id stamp). Bigger blast
-- radius: a stray token left in localStorage (private testing, a shared
-- machine, an invite link opened while logged into a different account) +
-- useAgencyBootstrap's auto-consume-on-load = the wrong account silently
-- joined as staff.
--
-- Fix: the caller's JWT email must match the address the invite was issued to.
-- The legit flows are unaffected — CounsellorSignupPage pre-fills and the
-- email-confirmation path signs up with invite.email, so the new account's
-- email always equals the token's email. Only the "already signed in as
-- someone else, following an invite link" path changes: it now errors
-- (WRONG_ACCOUNT) instead of attaching the wrong account.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.consume_agency_invite(
  input_token text,
  p_agreement_accepted boolean default false,
  p_signed_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid                uuid := auth.uid();
  v_caller_email       text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_agency             uuid;
  v_role               text;
  v_etype              text;
  v_created            timestamptz;
  v_invite_email       text;
  v_requires_agreement boolean;
  v_has_agreement      boolean;
  v_agreement_version  integer;
  v_require_codenames  boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select agency_id, role, employment_type, created_at, lower(email)
    into v_agency, v_role, v_etype, v_created, v_invite_email
  from public.agency_invite_token
  where token = input_token
    and used_at is null
    and expires_at > now();

  if not found then
    -- Already attached to an agency by a prior consume? Report ok so a
    -- double-submit on the sign-up form doesn't hard-fail.
    if exists (select 1 from public.agency_members where user_id = v_uid and status = 'active') then
      return jsonb_build_object('ok', true, 'already_member', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  end if;

  -- The token was issued to a specific address — only that account may burn it.
  -- Idempotency for a legit double-submit is still covered above (already a
  -- member -> ok); this only blocks a *different* account from consuming.
  if v_caller_email is null or v_caller_email is distinct from v_invite_email then
    raise exception 'WRONG_ACCOUNT: This invite was sent to a different email address. Sign in as the invited account, or ask the agency for a new invite.';
  end if;

  select staff_agreement_required, agreement_version, require_client_codenames,
         (agreement_text is not null and agreement_text <> '') or (agreement_pdf_url is not null)
    into v_requires_agreement, v_agreement_version, v_require_codenames, v_has_agreement
  from public.agencies where id = v_agency;

  if coalesce(v_requires_agreement, false) and coalesce(v_has_agreement, false) and not p_agreement_accepted then
    raise exception 'AGREEMENT_NOT_ACCEPTED: You must accept the agency working agreement to continue.';
  end if;

  insert into public.agency_members (
    agency_id, user_id, role, employment_type, invited_at, joined_at,
    agreement_accepted_at, agreement_accepted_version, agreement_signed_name
  )
  values (
    v_agency, v_uid, v_role, v_etype, v_created, now(),
    case when p_agreement_accepted then now() else null end,
    case when p_agreement_accepted then v_agreement_version else null end,
    nullif(trim(coalesce(p_signed_name, '')), '')
  )
  on conflict (user_id) do update
    set agency_id = excluded.agency_id,
        role      = excluded.role,
        employment_type = excluded.employment_type,
        status    = 'active',
        joined_at = now(),
        agreement_accepted_at =
          coalesce(excluded.agreement_accepted_at, public.agency_members.agreement_accepted_at),
        agreement_accepted_version =
          coalesce(excluded.agreement_accepted_version, public.agency_members.agreement_accepted_version),
        agreement_signed_name =
          coalesce(excluded.agreement_signed_name, public.agency_members.agreement_signed_name);

  update public.users set agency_id = v_agency where id = v_uid;

  if coalesce(v_require_codenames, false) then
    update public.practice_settings set use_client_codenames = true where admin_id = v_uid;
  end if;

  update public.agency_invite_token set used_at = now() where token = input_token;

  return jsonb_build_object('ok', true, 'agency_id', v_agency, 'role', v_role);
end;
$func$;

revoke execute on function public.consume_agency_invite(text, boolean, text) from anon;
grant  execute on function public.consume_agency_invite(text, boolean, text) to authenticated;

-- One-off: drop a stale unused invite token for "Awesome Agency" (issued to a
-- typo address, never consumed) so it can't be picked up from a leftover
-- localStorage entry. No-op once it's gone / on any DB that never had it.
delete from public.agency_invite_token
where token = 'b82dbc13fde14e3fa8b6ef40883e8921'
  and used_at is null;

notify pgrst, 'reload schema';
