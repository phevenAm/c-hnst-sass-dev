-- ─────────────────────────────────────────────────────────────────────────────
-- Fix three bugs in the stub-invite → sign-up → merge pipeline:
--
-- 1. Clients had no SELECT policy on client_stubs, so AuthContext could not
--    check whether the newly-signed-up user was linked to a stub after calling
--    consume_platform_access_token. That check guards the notify-admin-stub-joined
--    call, so admins never received the "client joined" email.
--
-- 2. InviteStubModal (and AccessTokenModal) insert platform_access_token rows
--    without admin_id. The RLS policy blocks such inserts silently (Supabase
--    returns {data:null, error:null} without .select()). A BEFORE INSERT trigger
--    that stamps admin_id = auth.uid() makes every insert self-sufficient.
--
-- 3. consume_platform_access_token copied stub_sessions.location verbatim into
--    sessions.location which has a CHECK constraint (only 'remote'/'in_person'
--    are valid). Any other text would cause the whole function to throw, failing
--    the sign-up. Sanitise on import.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Let clients see their own linked stub ──────────────────────────────────
-- (read-only; admins already have their own policy for writes)
drop policy if exists "clients can view own linked stub" on public.client_stubs;

create policy "clients can view own linked stub"
  on public.client_stubs for select
  using (linked_user_id = auth.uid());

-- ── 2. Auto-stamp admin_id on token insert ────────────────────────────────────
create or replace function public.stamp_token_admin_id()
returns trigger language plpgsql
as $func$
begin
  if new.admin_id is null then
    new.admin_id := auth.uid();
  end if;
  return new;
end;
$func$;

drop trigger if exists stamp_token_admin_id on public.platform_access_token;
create trigger stamp_token_admin_id
  before insert on public.platform_access_token
  for each row execute function public.stamp_token_admin_id();

-- ── 3. Defensive location sanitisation in consume_platform_access_token ───────
create or replace function public.consume_platform_access_token(input_token text)
returns boolean
language plpgsql security definer
set search_path = public
as $func$
declare
  v_admin_id uuid;
  v_stub_id  uuid;
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
