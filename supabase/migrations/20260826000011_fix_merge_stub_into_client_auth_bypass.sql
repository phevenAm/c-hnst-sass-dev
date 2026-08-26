-- SECURITY FIX: merge_stub_into_client(p_stub_id, p_real_user_id, p_admin_id)
-- took the calling admin's id as a plain parameter and checked ownership
-- against *that* value, instead of deriving it from auth.uid() like every
-- other function in this file (merge_stub_to_user, respond_manual_payment,
-- etc) correctly does. The frontend (MergeStubModal.tsx) passes
-- userProfile!.id as p_admin_id — a value the caller fully controls. Since
-- this function is also SECURITY DEFINER and was executable by the anon
-- role, anyone — no login required — could call it with a fabricated
-- p_admin_id and merge one practice's stub client (including their session
-- notes) into another practice's real client account, or into any account
-- at all, entirely bypassing auth.
--
-- Fix: drop the p_admin_id parameter and use auth.uid() directly, matching
-- merge_stub_to_user's pattern. This changes the function's signature, so
-- the old 3-arg version is dropped explicitly (CREATE OR REPLACE can't
-- remove a parameter) and the frontend call site is updated in the same
-- commit as this migration to stop passing p_admin_id.

drop function if exists public.merge_stub_into_client(uuid, uuid, uuid);

create function public.merge_stub_into_client(p_stub_id uuid, p_real_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Verify the stub belongs to the calling admin and is not already merged
  if not exists (
    select 1 from public.client_stubs
    where id = p_stub_id
      and created_by = auth.uid()
      and linked_user_id is null
  ) then
    raise exception 'stub not found, not owned by this admin, or already merged';
  end if;

  -- Verify the target client belongs to the calling admin
  if not exists (
    select 1 from public.users
    where id = p_real_user_id
      and admin_id = auth.uid()
  ) then
    raise exception 'client not found or not owned by this admin';
  end if;

  -- Link the stub to the real user
  update public.client_stubs
  set linked_user_id = p_real_user_id
  where id = p_stub_id;

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
    p_real_user_id,
    ss.admin_id,
    ss.scheduled_at,
    coalesce(ss.duration_minutes, 50),
    case ss.status
      when 'attended'  then 'completed'
      when 'no_show'   then 'completed'
      when 'cancelled' then 'cancelled'
      else 'scheduled'
    end::public.session_status,
    'in_person',
    coalesce(ss.amount_paid, 0) * 100,
    coalesce(ss.amount_paid, 0) > 0,
    ss.notes,
    ss.code,
    ss.id
  from public.stub_sessions ss
  where ss.stub_id = p_stub_id;
end;
$func$;

revoke execute on function public.merge_stub_into_client(uuid, uuid) from anon;
