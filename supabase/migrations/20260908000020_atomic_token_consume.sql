-- ─────────────────────────────────────────────────────────────────────────────
-- H1 — make platform-access-token consumption atomic (single-use for real).
--
-- The prior body (20260901000013) checked the token with a SELECT, then later
-- did a *separate* `UPDATE ... SET is_used = true WHERE token = $1` with no
-- `is_used = false` predicate and no row-count check. Two concurrent calls with
-- the same token both passed the SELECT, both ran the UPDATE, and both returned
-- true — one token could enrol many accounts (all linked to the same practice),
-- defeating the whole single-use / paid-access model.
--
-- Fix: keep the up-front SELECT (so a paused practice or a plan-cap breach can
-- still bail WITHOUT burning the token), but turn the state change into an
-- atomic claim — `UPDATE ... WHERE token = $1 AND is_used is not true` — and
-- bail if it touches zero rows. Under READ COMMITTED the second concurrent call
-- blocks on the row lock, then re-evaluates its WHERE against the committed row
-- (is_used now true) → 0 rows → NOT FOUND → returns false. Exactly one caller
-- can pass the claim for any given token.
--
-- Everything after the claim (admin link, stub merge) is byte-for-byte the
-- 20260901000013 body. CREATE OR REPLACE keeps the existing ACL (identical
-- signature); the grants at the foot just re-assert the documented end state
-- (authenticated only) in case of drift.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.consume_platform_access_token(input_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $func$
declare
  v_admin_id uuid;
  v_stub_id  uuid;
  v_codename text;
  v_paused   boolean;
  v_max      integer;
begin
  -- Read first (existence + expiry). No writes yet, so the paused / cap
  -- guards below can return without consuming the token.
  select admin_id, stub_id
    into v_admin_id, v_stub_id
  from public.platform_access_token
  where token = input_token
    and (is_used is null or is_used = false)
    and (expires_at is null or expires_at > now());

  if not found then
    return false;
  end if;

  select is_paused into v_paused
  from public.practice_settings
  where admin_id = v_admin_id;

  if coalesce(v_paused, false) then
    return false;
  end if;

  -- Plan cap: a plain token signup is a net-new active client. A stub invite
  -- is a conversion (the stub already counted), so only guard when v_stub_id
  -- is null. Fails closed with a client-facing message; the practitioner knows
  -- why (they're at their tier's limit).
  if v_stub_id is null and v_admin_id is not null then
    select pl.max_active into v_max
    from public.practice_settings ps
    join public.plan_limits pl on pl.plan = ps.subscription_plan
    where ps.admin_id = v_admin_id;

    if v_max is not null and public.active_client_count(v_admin_id) >= v_max then
      raise exception
        'This practice has reached its client limit. Please contact your practitioner.'
        using errcode = 'P0001';
    end if;
  end if;

  -- ── Atomic claim ──────────────────────────────────────────────────────────
  -- This is the single serialization point. The predicate repeats the
  -- unused + unexpired checks so a token consumed by a concurrent call (or
  -- expiring in the gap since the SELECT) matches zero rows here.
  update public.platform_access_token
    set is_used = true, used_at = now()
  where token = input_token
    and (is_used is null or is_used = false)
    and (expires_at is null or expires_at > now());

  if not found then
    -- Another concurrent signup claimed this token first.
    return false;
  end if;

  -- Link the new user to the admin who owns this token
  update public.users
    set admin_id = v_admin_id
  where id = auth.uid()
    and v_admin_id is not null;

  -- If this was a stub invite, run the full merge
  if v_stub_id is not null then
    -- Read the stub's codename before touching the stub row
    select codename into v_codename
    from public.client_stubs
    where id = v_stub_id;

    -- Carry codename to the real user record (only if not already set)
    if v_codename is not null then
      update public.users
        set admin_codename = v_codename
      where id = auth.uid()
        and admin_codename is null;
    end if;

    -- Transfer session notes to the real user
    update public.session_notes
      set user_id = auth.uid(), stub_id = null
      where stub_id = v_stub_id;

    -- Import stub sessions as real sessions so history carries over.
    -- location is sanitised: stub_sessions has no constraint, sessions does.
    insert into public.sessions (
      client_id,
      created_by,
      scheduled_at,
      duration_minutes,
      status,
      location,
      price_pence,
      paid,
      notes,
      reference_code,
      imported_from_stub_id
    )
    select
      auth.uid(),
      ss.admin_id,
      ss.scheduled_at,
      coalesce(ss.duration_minutes, 50),
      case ss.status
        when 'attended'  then 'completed'
        when 'no_show'   then 'completed'
        when 'cancelled' then 'cancelled'
        else 'scheduled'
      end::public.session_status,
      case when ss.location in ('remote', 'in_person') then ss.location else 'in_person' end,
      coalesce(ss.amount_paid, 0) * 100,
      coalesce(ss.amount_paid, 0) > 0,
      ss.notes,
      ss.code,
      ss.id
    from public.stub_sessions ss
    where ss.stub_id = v_stub_id
      and not exists (
        select 1 from public.sessions s
        where s.imported_from_stub_id = ss.id
      );

    -- Transfer any form assignments the admin pre-assigned to this stub
    update public.questionnaire_assignments
      set user_id = auth.uid(), stub_id = null
      where stub_id = v_stub_id;

    -- Link the stub record to the new real user
    update public.client_stubs
      set linked_user_id = auth.uid()
      where id = v_stub_id;
  end if;

  return true;
end;
$func$;

-- Re-assert the intended end state (idempotent; no-op if already so).
revoke execute on function public.consume_platform_access_token(text) from public, anon;
grant  execute on function public.consume_platform_access_token(text) to authenticated;

notify pgrst, 'reload schema';
