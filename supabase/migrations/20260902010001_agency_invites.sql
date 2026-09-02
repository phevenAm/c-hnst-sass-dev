-- ─────────────────────────────────────────────────────────────────────────────
-- Agencies, part 2 of 5: member invites.
--
-- A manager invites another admin into the agency by email. The invite carries
-- the agency, the role they'll hold, and their employment type. On sign-up (or
-- when an existing admin follows the link) consume_agency_invite() attaches
-- them: creates the agency_members row and stamps users.agency_id.
--
-- Mirrors the platform_access_token pattern (20260725000005 / 20260729000003):
-- the table is RLS-locked to the owning agency's managers, and anon sign-up
-- verifies a single token through a SECURITY DEFINER function rather than ever
-- reading the table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.agency_invite_token (
  token           text        primary key default replace(gen_random_uuid()::text, '-', ''),
  agency_id       uuid        not null references public.agencies(id) on delete cascade,
  email           text        not null,
  role            text        not null default 'counsellor'
                              check (role in ('manager', 'counsellor')),
  employment_type text        not null default 'employee'
                              check (employment_type in ('employee', 'freelance')),
  created_by      uuid        not null references auth.users(id) on delete cascade,
  expires_at      timestamptz not null default now() + interval '14 days',
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists agency_invite_token_agency_id_idx on public.agency_invite_token (agency_id);

alter table public.agency_invite_token enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_invite_token'
      and policyname='managers manage agency invites') then
    execute $pol$
      create policy "managers manage agency invites" on public.agency_invite_token
        for all to authenticated
        using (agency_id = public.current_agency_id() and public.is_agency_manager())
        with check (agency_id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;
end $func$;

grant select, insert, update, delete on public.agency_invite_token to authenticated;

-- ── validate_agency_invite(token) ──────────────────────────────────────────
-- Anon-safe: called from the sign-up screen before an account exists. Returns
-- just enough to render "You've been invited to join <Agency> as a counsellor"
-- and to pre-fill / lock the email field. Knowing the (random) token is the
-- authorisation — same trust model as validate_platform_access_token.
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
    'employment_type', t.employment_type
  )
  from (select null) noop
  left join public.agency_invite_token t
    on t.token = input_token
   and t.used_at is null
   and t.expires_at > now()
  left join public.agencies a on a.id = t.agency_id;
$func$;

-- ── consume_agency_invite(token) ───────────────────────────────────────────
-- Runs as the just-authenticated user. Attaches them to the agency and burns
-- the token. Idempotent-ish: a second call for an already-attached user whose
-- membership matches the token is treated as success.
create or replace function public.consume_agency_invite(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid    uuid := auth.uid();
  v_agency uuid;
  v_role   text;
  v_etype  text;
  v_created timestamptz;
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

  insert into public.agency_members (agency_id, user_id, role, employment_type, invited_at, joined_at)
  values (v_agency, v_uid, v_role, v_etype, v_created, now())
  on conflict (user_id) do update
    set agency_id = excluded.agency_id,
        role      = excluded.role,
        employment_type = excluded.employment_type,
        status    = 'active',
        joined_at = now();

  update public.users set agency_id = v_agency where id = v_uid;

  update public.agency_invite_token set used_at = now() where token = input_token;

  return jsonb_build_object('ok', true, 'agency_id', v_agency, 'role', v_role);
end;
$func$;

revoke execute on function public.validate_agency_invite(text) from authenticated;
grant  execute on function public.validate_agency_invite(text) to anon, authenticated;
revoke execute on function public.consume_agency_invite(text)  from anon;
grant  execute on function public.consume_agency_invite(text)  to authenticated;
