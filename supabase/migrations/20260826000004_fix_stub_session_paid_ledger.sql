-- payment_ledger_rows (20260818000003) computed a stub session's paid status
-- purely from amount_paid, ignoring the separate `paid` boolean — the same
-- field CreateSessionModal writes when a session is marked paid at creation
-- (and the field StubSessionCard's own Mark as paid/unpaid toggle flips),
-- neither of which ever touches amount_paid. Result: a session created
-- already paid showed correctly on the client's own detail page (which reads
-- `paid`) but as outstanding on the Payments page (which only read
-- amount_paid) — exactly the split-brain this view was meant to avoid.
--
-- Either signal alone now means paid. amount_paid is the more specific
-- figure when set (it can reflect a discount or partial payment, differing
-- from the listed price), falling back to price_pence when only the plain
-- boolean was set.

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
  case
    when ss.amount_paid is not null and ss.amount_paid > 0 then round(ss.amount_paid * 100)::integer
    when ss.paid then coalesce(ss.price_pence, 0)
    else 0
  end as amount_pence,
  (ss.paid or (ss.amount_paid is not null and ss.amount_paid > 0)) as is_paid,
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
