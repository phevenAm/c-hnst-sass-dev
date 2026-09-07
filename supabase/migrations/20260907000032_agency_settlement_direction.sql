-- ─────────────────────────────────────────────────────────────────────────────
-- Agency ⇄ staff settlement direction — "who pays who", configurable.
--
-- Until now public.agency_invoices was hard-wired staff -> agency (a
-- freelancer's seat / commission fee). Agencies also need the reverse: the
-- agency paying an employed counsellor for delivered work.
--
-- Model: per-staff-member override, with an agency-wide default.
--   * agencies.default_settlement_direction  — 'auto' derives per member from
--     employment_type; or pin it agency-wide.
--   * agency_members.settlement_direction    — NULL = follow the agency default;
--     set = override for this person.
--   * agency_member_settlement(uid)          — resolves the effective value.
--   * agency_invoices.direction              — which way THIS invoice runs.
--   * agency_invoices.payment_method         — how a paid invoice was settled
--     (cash / bank transfer / Stripe / other), surfaced in the activity log.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agencies: the default ───────────────────────────────────────────────────
alter table public.agencies
  add column if not exists default_settlement_direction text not null default 'auto';

alter table public.agencies drop constraint if exists agencies_settlement_direction_check;
alter table public.agencies
  add constraint agencies_settlement_direction_check
  check (default_settlement_direction in ('auto', 'staff_pays_agency', 'agency_pays_staff', 'none'));

-- ── agency_members: the per-person override ─────────────────────────────────
alter table public.agency_members
  add column if not exists settlement_direction text;

alter table public.agency_members drop constraint if exists agency_members_settlement_direction_check;
alter table public.agency_members
  add constraint agency_members_settlement_direction_check
  check (settlement_direction is null
         or settlement_direction in ('staff_pays_agency', 'agency_pays_staff', 'none'));

-- ── Resolver: effective direction for one member ───────────────────────────
-- Precedence: explicit per-member override  >  agency default (if pinned)  >
-- derived from employment_type (employee => agency pays; freelance => pays agency).
create or replace function public.agency_member_settlement(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $func$
  select coalesce(
    am.settlement_direction,
    nullif(ag.default_settlement_direction, 'auto'),
    case am.employment_type
      when 'employee' then 'agency_pays_staff'
      else 'staff_pays_agency'
    end
  )
  from public.agency_members am
  join public.agencies ag on ag.id = am.agency_id
  where am.user_id = p_user
    and am.status = 'active';
$func$;

revoke execute on function public.agency_member_settlement(uuid) from anon;
grant  execute on function public.agency_member_settlement(uuid) to authenticated;

-- ── agency_invoices: direction + payment method ───────────────────────────
alter table public.agency_invoices
  add column if not exists direction      text not null default 'staff_to_agency',
  add column if not exists payment_method text;

alter table public.agency_invoices drop constraint if exists agency_invoices_direction_check;
alter table public.agency_invoices
  add constraint agency_invoices_direction_check
  check (direction in ('staff_to_agency', 'agency_to_staff'));

alter table public.agency_invoices drop constraint if exists agency_invoices_payment_method_check;
alter table public.agency_invoices
  add constraint agency_invoices_payment_method_check
  check (payment_method is null
         or payment_method in ('cash', 'bank_transfer', 'stripe', 'other'));

-- ── mark paid — now records HOW it was settled ────────────────────────────
-- Drop the 2-arg version first: adding a defaulted 3rd param would otherwise
-- register a second overload and make mark_agency_invoice_paid(uuid, ts) ambiguous.
drop function if exists public.mark_agency_invoice_paid(uuid, timestamptz);

create or replace function public.mark_agency_invoice_paid(
  p_invoice_id uuid,
  p_paid_at    timestamptz default now(),
  p_method     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_agency uuid := public.current_agency_id();
  v_found  uuid;
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  if p_method is not null and p_method not in ('cash', 'bank_transfer', 'stripe', 'other') then
    raise exception 'Unknown payment method: %', p_method;
  end if;

  update public.agency_invoices
     set status = 'paid',
         paid_at = p_paid_at,
         payment_method = coalesce(p_method, payment_method)
   where id = p_invoice_id and agency_id = v_agency
  returning id into v_found;

  if v_found is null then
    raise exception 'Invoice not found';
  end if;
end;
$func$;

revoke execute on function public.mark_agency_invoice_paid(uuid, timestamptz, text) from anon;
grant  execute on function public.mark_agency_invoice_paid(uuid, timestamptz, text) to authenticated;

-- ── Overview for the Agency Settings screen ───────────────────────────────
-- One row per active member with the resolved direction, for the manager's
-- "who pays who" table.
create or replace function public.agency_settlement_overview()
returns table (
  user_id              uuid,
  name                 text,
  role                 text,
  employment_type      text,
  override             text,   -- agency_members.settlement_direction (may be null)
  effective_direction  text
)
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_agency uuid := public.current_agency_id();
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  return query
  select
    am.user_id,
    coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
             u.display_name, u.email, 'Member') as name,
    am.role,
    am.employment_type,
    am.settlement_direction as override,
    public.agency_member_settlement(am.user_id) as effective_direction
  from public.agency_members am
  left join public.users u on u.id = am.user_id
  where am.agency_id = v_agency
    and am.status = 'active'
  order by am.role, name;
end;
$func$;

revoke execute on function public.agency_settlement_overview() from anon;
grant  execute on function public.agency_settlement_overview() to authenticated;

notify pgrst, 'reload schema';
