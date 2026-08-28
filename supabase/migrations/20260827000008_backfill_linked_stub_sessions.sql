-- Backfill: import sessions for stubs that were linked to a real client BEFORE
-- merge_stub_to_user learned to do it (that was added 2026-08-17 in
-- 20260817000001). Those stubs have linked_user_id set but their stub_sessions
-- were never copied onto the real client, so the appointments show up in the
-- dashboard under the offline record — a person who no longer appears in the
-- client list — and never on the real client's page.
--
-- Same column mapping and idempotency guard as merge_stub_to_user /
-- consume_platform_access_token, so re-running this (or a later invite/merge)
-- can't double-import: the `not exists (... imported_from_stub_id ...)` check
-- skips any stub_session already represented in sessions.

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
join public.client_stubs cs on cs.id = ss.stub_id
where cs.linked_user_id is not null
  and not exists (
    select 1 from public.sessions s
    where s.imported_from_stub_id = ss.id
  );
