-- ─────────────────────────────────────────────────────────────────────────────
-- Makes agency "policy switches" real, and adds a versioned agency working
-- agreement with staff acceptance.
--
-- Until now every switch on `agencies` (locked_consent, shared_resources,
-- require_note_encryption, locked_email_templates) was write-only — nothing
-- read them (see 20260902010000's own header comment: "read paths honour
-- these in ... / the app" — they never did). This migration wires up the two
-- that have a real enforcement point in the existing app:
--
--   * require_client_codenames — forces public.practice_settings.use_client_codenames
--     on for every member, and blocks turning it back off while the policy stands.
--   * locked_consent — get_my_admin_consent_settings() now falls back to the
--     agency's consent text/PDF for a locked member's clients.
--
-- shared_resources / require_note_encryption / locked_email_templates stay as
-- agency-level intent for now (see 20260902010000) — wiring those touches the
-- resources query layer and session-note encryption setup respectively, a
-- larger change than this pass; flagged, not silently "faked".
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agencies
  add column if not exists require_client_codenames boolean not null default false,
  add column if not exists staff_agreement_required  boolean not null default true,
  add column if not exists agreement_text            text,
  add column if not exists agreement_pdf_url          text,
  add column if not exists agreement_version          integer not null default 1;

alter table public.agency_members
  add column if not exists agreement_accepted_at      timestamptz,
  add column if not exists agreement_accepted_version integer,
  add column if not exists agreement_signed_name       text;

-- ── Bump the agreement version whenever its content actually changes, so a
-- member's agreement_accepted_version can be compared against the agency's
-- current agreement_version to tell whether they signed the current text. ──
create or replace function public.bump_agency_agreement_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.agreement_text is distinct from old.agreement_text
     or new.agreement_pdf_url is distinct from old.agreement_pdf_url then
    new.agreement_version := old.agreement_version + 1;
  end if;
  return new;
end;
$func$;

drop trigger if exists agencies_bump_agreement_version on public.agencies;
create trigger agencies_bump_agreement_version
  before update on public.agencies
  for each row execute function public.bump_agency_agreement_version();

-- ── consume_agency_invite: gate on the working agreement ────────────────────
-- Re-created with two new optional args so any existing caller passing only
-- input_token keeps working; the agreement gate only blocks when the agency
-- actually requires one (staff_agreement_required + has text/PDF set).
drop function if exists public.consume_agency_invite(text);

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
  v_agency             uuid;
  v_role               text;
  v_etype              text;
  v_created            timestamptz;
  v_requires_agreement boolean;
  v_has_agreement      boolean;
  v_agreement_version  integer;
  v_require_codenames  boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select agency_id, role, employment_type, created_at
    into v_agency, v_role, v_etype, v_created
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

-- ── validate_agency_invite: surface the agreement so sign-up can render it ──
create or replace function public.validate_agency_invite(input_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $func$
  select jsonb_build_object(
    'valid',       t.token is not null,
    'agency_id',   t.agency_id,
    'agency_name', a.name,
    'email',       t.email,
    'role',        t.role,
    'employment_type', t.employment_type,
    'staff_agreement_required', coalesce(a.staff_agreement_required, false),
    'agreement_text', a.agreement_text,
    'agreement_pdf_url', a.agreement_pdf_url,
    'agreement_version', a.agreement_version
  )
  from (select null) noop
  left join public.agency_invite_token t
    on t.token = input_token
   and t.used_at is null
   and t.expires_at > now()
  left join public.agencies a on a.id = t.agency_id;
$func$;

-- ── Codename policy: block turning it off while the agency requires it ──────
create or replace function public.enforce_agency_codename_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.use_client_codenames = false and exists (
    select 1
    from public.agency_members am
    join public.agencies ag on ag.id = am.agency_id
    where am.user_id = new.admin_id
      and am.status = 'active'
      and ag.require_client_codenames
  ) then
    raise exception 'AGENCY_POLICY_CODENAMES: Your agency requires client codenames to stay switched on.';
  end if;
  return new;
end;
$func$;

drop trigger if exists enforce_agency_codename_policy_practice_settings on public.practice_settings;
create trigger enforce_agency_codename_policy_practice_settings
  before update on public.practice_settings
  for each row execute function public.enforce_agency_codename_policy();

-- When a manager switches the policy on, force it on for every current
-- member immediately (new joiners get it via consume_agency_invite above).
create or replace function public.cascade_agency_codename_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  if new.require_client_codenames and not old.require_client_codenames then
    update public.practice_settings
    set use_client_codenames = true
    where admin_id in (
      select user_id from public.agency_members where agency_id = new.id and status = 'active'
    );
  end if;
  return new;
end;
$func$;

drop trigger if exists agencies_cascade_codename_policy on public.agencies;
create trigger agencies_cascade_codename_policy
  after update on public.agencies
  for each row execute function public.cascade_agency_codename_policy();

-- ── Client consent: a locked member's clients see the AGENCY's consent ──────
create or replace function public.get_my_admin_consent_settings()
returns table (
  consent_enabled        boolean,
  consent_title          text,
  consent_body           text,
  consent_pdf_url        text,
  consent_counsellor_cta text
)
language sql
security definer
stable
set search_path = public
as $func$
  select
    case when ag.locked_consent then true else ps.consent_enabled end,
    case when ag.locked_consent then ag.name || ' — working agreement' else ps.consent_title end,
    case when ag.locked_consent then ag.consent_text else ps.consent_body end,
    case when ag.locked_consent then ag.consent_pdf_url else ps.consent_pdf_url end,
    ps.consent_counsellor_cta
  from public.practice_settings ps
  join public.users u on u.admin_id = ps.admin_id
  left join public.agency_members am on am.user_id = ps.admin_id and am.status = 'active'
  left join public.agencies ag on ag.id = am.agency_id and ag.locked_consent
  where u.id = auth.uid()
  limit 1;
$func$;

revoke execute on function public.get_my_admin_consent_settings() from anon;

notify pgrst, 'reload schema';
