-- ─────────────────────────────────────────────────────────────────────────────
-- Close the client-cap blind spot for token signups.
--
-- enforce_client_active_limit (20260901000011) never fires for a client who
-- signs up with an access token:
--   * handle_new_user INSERTs public.users with admin_id still NULL
--     → trigger guard `v_admin is null` → skipped
--   * consume_platform_access_token then UPDATEs admin_id, but by then
--     `v_active_before` is already true (role='client', not archived)
--     → trigger guard `v_active_before` → skipped
-- so a practice sitting at its cap can still take on new clients via a token.
--
-- Fix it where the link actually happens: in consume_platform_access_token,
-- refuse a *plain* token that would push the practice past max_active. A stub
-- invite (v_stub_id set) is a conversion — the stub row already counted toward
-- the cap — so it stays exempt.
--
-- Body is otherwise identical to the version in 20260826000000_practice_pause.sql.
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

  update public.platform_access_token
    set is_used = true, used_at = now()
    where token = input_token;

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
