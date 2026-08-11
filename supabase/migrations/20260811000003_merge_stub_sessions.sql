-- Track which sessions were imported from an offline stub record
alter table public.sessions
  add column if not exists imported_from_stub_id uuid
    references public.stub_sessions(id) on delete set null;

comment on column public.sessions.imported_from_stub_id is
  'Set when a session was imported from stub_sessions during a stub→client merge. '
  'Null for all natively created sessions.';

-- stub_sessions use text statuses: scheduled/attended/no_show/cancelled
-- session_status enum values: scheduled/completed/cancelled/rescheduled
-- Mapping: attended → completed, no_show → completed, others pass through.

-- ── Backfill: import stub sessions for stubs already merged ──────────────────
-- stub_sessions.amount_paid is stored in whole pounds (integer).
-- sessions.price_pence is stored in pence.
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
  cs.linked_user_id,
  ss.admin_id,
  ss.scheduled_at,
  coalesce(ss.duration_minutes, 50),
  case ss.status
    when 'attended' then 'completed'
    when 'no_show'  then 'completed'
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
join public.client_stubs cs on cs.id = ss.stub_id
where cs.linked_user_id is not null
  -- Skip if already imported (idempotent)
  and not exists (
    select 1 from public.sessions s
    where s.imported_from_stub_id = ss.id
  );

-- ── RPC: atomic merge — links stub + imports its sessions ───────────────────
create or replace function public.merge_stub_into_client(
  p_stub_id      uuid,
  p_real_user_id uuid,
  p_admin_id     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- Verify the stub belongs to this admin and is not already merged
  if not exists (
    select 1 from public.client_stubs
    where id = p_stub_id
      and created_by = p_admin_id
      and linked_user_id is null
  ) then
    raise exception 'stub not found, not owned by this admin, or already merged';
  end if;

  -- Verify the target client belongs to this admin
  if not exists (
    select 1 from public.users
    where id = p_real_user_id
      and admin_id = p_admin_id
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

grant execute on function public.merge_stub_into_client(uuid, uuid, uuid) to authenticated;
