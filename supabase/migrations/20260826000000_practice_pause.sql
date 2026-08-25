-- Superadmin ability to pause a practice: read-only in the app (admin and
-- their clients alike — writes raise, reads are untouched) and Stripe
-- billing paused via pause_collection, since charging for an account you've
-- made read-only doesn't make sense. Toggling happens through the
-- superadmin-set-practice-paused edge function (touches Stripe, needs the
-- secret key), not directly against this table.

alter table public.practice_settings
  add column if not exists is_paused boolean not null default false,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_reason text;

-- Resolves whether the CALLING user — admin or client — belongs to a
-- currently-paused practice. Mirrors get_my_is_demo()'s shape but has to
-- resolve one hop further for clients (their own row has no is_paused of
-- its own; it lives on their admin's practice_settings row).
create or replace function public.get_my_is_paused()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $func$
  select coalesce(
    (
      select ps.is_paused
      from public.practice_settings ps
      where ps.admin_id = coalesce(
        (select u.admin_id from public.users u where u.id = auth.uid()),
        auth.uid()
      )
    ),
    false
  );
$func$;

create or replace function public.block_paused_write()
returns trigger
language plpgsql
as $func$
begin
  if public.get_my_is_paused() then
    raise exception 'This account is paused. Contact support to resume.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$func$;

-- Every table an admin or their clients can write to day-to-day. Deliberately
-- excludes system-written tables (audit_logs, email_logs, notifications),
-- feedback (a paused user reporting a bug is fine), and practice_settings
-- itself (the superadmin's own unpause write must never be blocked by this —
-- see the edge function, which authenticates as superadmin, not the paused
-- admin, so get_my_is_paused() would read false for that call anyway, but
-- there's no reason to add the trigger there at all).
do $do$
declare
  t text;
begin
  foreach t in array array[
    'sessions', 'session_notes', 'resources', 'questionnaires', 'questions',
    'questionnaire_assignments', 'responses', 'tags', 'client_stubs', 'stub_sessions',
    'cpd_logs', 'supervision_sessions', 'payments', 'availability_rules',
    'availability_overrides', 'admin_todos', 'admin_private_events', 'session_packages',
    'cancellation_requests', 'reschedule_requests', 'admin_reminder_mutes',
    'rcads_assessments', 'journal_entries', 'resource_favourites', 'client_views',
    'admin_google_calendar', 'platform_access_token', 'users'
  ]
  loop
    execute format(
      'drop trigger if exists block_paused_write on public.%I', t
    );
    execute format(
      'create trigger block_paused_write before insert or update or delete on public.%I for each row execute function public.block_paused_write()',
      t
    );
  end loop;
end
$do$;

-- New client signups under a paused practice: block_paused_write on `users`
-- can't catch this — at signup the new row's admin_id isn't set yet, so
-- get_my_is_paused() has nothing to resolve against. Guard it directly here
-- instead: treat a paused practice's token exactly like an already-used one.
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
