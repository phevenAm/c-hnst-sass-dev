-- ─────────────────────────────────────────────────────────────────────────────
-- Two Phase-2 fixes:
--
-- 1. CODENAME CARRY-ACROSS (todo 8124f803)
--    When a stub client accepts their invite and signs up, their codename
--    should transfer to the real users row so admins see it in the codename
--    column. This is done inside consume_platform_access_token at merge time.
--
-- 2. AUTO-CANCEL RESPECTS auto_cancel_enabled FLAG (todos c6fa915f, d41546eb, 264b4534)
--    auto_cancel_unpaid_sessions() now checks auto_cancel_enabled before
--    cancelling sessions. Practices that have not opted in are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Update consume_platform_access_token to copy codename ─────────────────
create or replace function public.consume_platform_access_token(input_token text)
returns boolean
language plpgsql security definer
set search_path = public
as $func$
declare
  v_admin_id uuid;
  v_stub_id  uuid;
  v_codename text;
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

-- ── 1b. Also fix merge_stub_to_user (admin-initiated manual merge) ───────────
-- The manual merge button on the stub detail page calls this RPC. It previously
-- only transferred session_notes. Now it also imports stub_sessions and carries
-- the codename across — matching the consume_platform_access_token behaviour.
create or replace function public.merge_stub_to_user(
  p_stub_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_codename text;
begin
  if not exists (
    select 1 from public.client_stubs
    where id = p_stub_id and created_by = auth.uid()
  ) then
    raise exception 'Not authorised or stub not found';
  end if;

  -- Read codename before modifying the stub
  select codename into v_codename
  from public.client_stubs
  where id = p_stub_id;

  -- Carry codename to the real user (only if the user doesn't already have one)
  if v_codename is not null then
    update public.users
      set admin_codename = v_codename
    where id = p_user_id
      and admin_codename is null;
  end if;

  -- Transfer session notes
  update public.session_notes
    set user_id = p_user_id, stub_id = null
    where stub_id = p_stub_id;

  -- Import stub sessions as real sessions
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
    p_user_id,
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
  where ss.stub_id = p_stub_id
    and not exists (
      select 1 from public.sessions s
      where s.imported_from_stub_id = ss.id
    );

  -- Transfer form assignments
  update public.questionnaire_assignments
    set user_id = p_user_id, stub_id = null
    where stub_id = p_stub_id;

  -- Link the stub to the real user
  update public.client_stubs
    set linked_user_id = p_user_id
    where id = p_stub_id;
end;
$func$;

-- ── 2. Auto-cancel respects auto_cancel_enabled ───────────────────────────────
create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- ── Real sessions (per-practice deadline, only when opted in) ──────────────
  update public.sessions s
  set status = 'cancelled'
  from public.practice_settings ps
  where ps.admin_id = s.created_by
    and ps.auto_cancel_enabled = true
    and s.status   = 'scheduled'
    and s.paid     = false
    and s.scheduled_at <= now() + (ps.payment_deadline_hours * interval '1 hour');

  -- ── Stub sessions (per-practice deadline, only when opted in) ──────────────
  update public.stub_sessions ss
  set status = 'cancelled'
  from public.practice_settings ps
  where ps.admin_id = ss.admin_id
    and ps.auto_cancel_enabled = true
    and ss.status      = 'scheduled'
    and ss.amount_paid is null
    and ss.scheduled_at <= now() + (ps.payment_deadline_hours * interval '1 hour');
end;
$func$;
