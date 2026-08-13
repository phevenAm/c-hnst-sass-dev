-- ────────────────────────────────────────────────────────────────────────────
-- 1. Allow form assignments to offline (stub) clients
-- ────────────────────────────────────────────────────────────────────────────

-- Make user_id nullable so rows can target a stub instead of a real user.
-- Existing rows are unchanged — they all have user_id set.
alter table public.questionnaire_assignments
  alter column user_id drop not null;

-- Add stub_id foreign key
alter table public.questionnaire_assignments
  add column if not exists stub_id uuid
    references public.client_stubs(id) on delete cascade;

-- Enforce that every row targets exactly one of: a real user OR a stub
alter table public.questionnaire_assignments
  drop constraint if exists check_assignment_target;

alter table public.questionnaire_assignments
  add constraint check_assignment_target
    check (
      (user_id is not null and stub_id is null)
      or
      (stub_id is not null and user_id is null)
    );

-- Index to make stub-scoped lookups fast
create index if not exists idx_qa_stub_id
  on public.questionnaire_assignments (stub_id)
  where stub_id is not null;

-- ── RLS: admins can already manage all assignments whose questionnaire they own.
-- That policy already covers stub assignments (no change needed for write).
-- Add a stub-facing read policy so we can surface these assignments in
-- the client's UI after the stub converts (user_id is set by the merge).
-- (No change needed: after merge user_id is populated, existing client policy covers it.)

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Fix consume_platform_access_token:
--    When an invited stub signs up, also import their sessions and
--    transfer any pre-assigned questionnaires.
-- ────────────────────────────────────────────────────────────────────────────

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
    where id = auth.uid();

  -- If this was a stub invite, run the full merge
  if v_stub_id is not null then
    -- Transfer session notes to the real user
    update public.session_notes
      set user_id = auth.uid(), stub_id = null
      where stub_id = v_stub_id;

    -- Import stub sessions as real sessions so history carries over
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
      coalesce(ss.location, 'in_person'),
      coalesce(ss.amount_paid, 0) * 100,
      coalesce(ss.amount_paid, 0) > 0,
      ss.notes,
      ss.code,
      ss.id
    from public.stub_sessions ss
    where ss.stub_id = v_stub_id
      -- Skip any already imported (idempotent)
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
