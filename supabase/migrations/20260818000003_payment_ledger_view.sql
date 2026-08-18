-- AdminPaymentsPage currently fetches every session, every stub_session, and
-- every manual payment in full (no limit), merges them client-side into one
-- list, and hands the whole thing to a table with no windowing — the row
-- count only grows over a practice's lifetime, so this gets slower forever.
--
-- payment_ledger_rows unions the three sources into one shape so the
-- frontend can query, filter, search, and — critically — paginate with a
-- single request instead of pulling everything.
--
-- It's a plain view, not a security-definer one: Postgres evaluates RLS on
-- the underlying tables (sessions, stub_sessions, payments, users,
-- client_stubs) using the querying role, so a view adds no privilege of its
-- own. The explicit admin_id/created_by filters below are redundant with
-- that RLS but keep the query planner from having to discover it, and make
-- the scoping obvious on read.
--
-- Client display names are intentionally left as raw columns (display_name,
-- first_name, last_name, admin_codename for real clients; stub_first_name,
-- stub_last_name, stub_codename for offline clients) rather than resolved
-- here, so the existing codename-aware clientDisplayName() logic on the
-- frontend stays the single source of truth for how a name is shown.

create or replace view public.payment_ledger_rows
with (security_invoker = true)
as
select
  s.id,
  'session'::text as source,
  s.client_id,
  null::uuid as stub_id,
  s.scheduled_at as date,
  s.price_pence as amount_pence,
  s.paid as is_paid,
  null::text as description,
  u.display_name,
  u.first_name as client_first_name,
  u.last_name as client_last_name,
  u.admin_codename,
  null::text as stub_first_name,
  null::text as stub_last_name,
  null::text as stub_codename
from public.sessions s
left join public.users u on u.id = s.client_id
where s.status <> 'cancelled'
  and s.created_by = auth.uid()

union all

select
  ss.id,
  'stub-session'::text as source,
  null::uuid as client_id,
  ss.stub_id,
  ss.scheduled_at as date,
  round(coalesce(ss.amount_paid, 0) * 100)::integer as amount_pence,
  (ss.amount_paid is not null and ss.amount_paid > 0) as is_paid,
  ss.notes as description,
  null::text as display_name,
  null::text as client_first_name,
  null::text as client_last_name,
  null::text as admin_codename,
  cs.first_name as stub_first_name,
  cs.last_name as stub_last_name,
  cs.codename as stub_codename
from public.stub_sessions ss
left join public.client_stubs cs on cs.id = ss.stub_id
where ss.status <> 'cancelled'
  and ss.admin_id = auth.uid()

union all

select
  p.id,
  'manual'::text as source,
  p.client_id,
  p.stub_id,
  p.paid_at as date,
  p.amount_pence,
  true as is_paid,
  p.description,
  u2.display_name,
  u2.first_name as client_first_name,
  u2.last_name as client_last_name,
  u2.admin_codename,
  cs2.first_name as stub_first_name,
  cs2.last_name as stub_last_name,
  cs2.codename as stub_codename
from public.payments p
left join public.users u2 on u2.id = p.client_id
left join public.client_stubs cs2 on cs2.id = p.stub_id
where p.admin_id = auth.uid();

grant select on public.payment_ledger_rows to authenticated;
