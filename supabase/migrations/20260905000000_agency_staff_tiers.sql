-- ─────────────────────────────────────────────────────────────────────────────
-- Agency subscription tiers, keyed on STAFF count.
--
-- Mirrors the client-count tier model for solo admins (plan_limits /
-- enforce_client_active_limit, 20260901000010-11) but keyed on ACTIVE
-- agency_members instead of clients. No Stripe wiring — an agency picks a
-- tier in-app; the trigger below is the actual enforcement (source of truth),
-- same as the client-tier triggers. Prices are display figures only.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.agency_plan_limits (
  plan               text primary key,
  max_staff          integer,             -- null = unlimited
  price_month_pence  integer not null,
  price_year_pence   integer not null,
  sort_order         integer not null default 0
);

insert into public.agency_plan_limits (plan, max_staff, price_month_pence, price_year_pence, sort_order) values
  ('starter',   10,   4900,  49000,  1),
  ('growth',    20,   8900,  89000,  2),
  ('scale',     50,   17900, 179000, 3),
  ('unlimited', null, 29900, 299000, 4)
on conflict (plan) do update
  set max_staff         = excluded.max_staff,
      price_month_pence = excluded.price_month_pence,
      price_year_pence  = excluded.price_year_pence,
      sort_order        = excluded.sort_order;

alter table public.agency_plan_limits enable row level security;

drop policy if exists "agency_plan_limits readable by authenticated" on public.agency_plan_limits;
create policy "agency_plan_limits readable by authenticated"
  on public.agency_plan_limits for select
  to authenticated
  using (true);

grant select on public.agency_plan_limits to authenticated;

-- ── agencies: which tier, billed how often ──────────────────────────────────
alter table public.agencies
  add column if not exists subscription_plan text not null default 'starter',
  add column if not exists billing_interval  text not null default 'month';

alter table public.agencies drop constraint if exists agencies_subscription_plan_fkey;
alter table public.agencies
  add constraint agencies_subscription_plan_fkey
  foreign key (subscription_plan) references public.agency_plan_limits(plan);

alter table public.agencies drop constraint if exists agencies_billing_interval_check;
alter table public.agencies
  add constraint agencies_billing_interval_check
  check (billing_interval in ('month', 'year'));

-- ── Counts ──────────────────────────────────────────────────────────────────
create or replace function public.active_staff_count(p_agency uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $func$
  select count(*) from public.agency_members where agency_id = p_agency and status = 'active';
$func$;

revoke execute on function public.active_staff_count(uuid) from public;
grant execute on function public.active_staff_count(uuid) to authenticated;

-- ── Enforcement: fires when a membership row transitions INTO active status
-- (new invite accepted, or a disabled member re-enabled). No-op updates that
-- were already active consume no new seat and are let through. ─────────────
create or replace function public.enforce_agency_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_active_now    boolean;
  v_active_before boolean := false;
  v_max           integer;
  v_count         integer;
begin
  v_active_now := new.status = 'active';
  if tg_op = 'UPDATE' then
    v_active_before := old.status = 'active';
  end if;

  if not v_active_now or v_active_before then
    return new;
  end if;

  select pl.max_staff into v_max
  from public.agencies a
  join public.agency_plan_limits pl on pl.plan = a.subscription_plan
  where a.id = new.agency_id;

  if v_max is null then          -- unlimited tier, or no agency row: fail open
    return new;
  end if;

  v_count := public.active_staff_count(new.agency_id);

  if v_count >= v_max then
    raise exception
      'AGENCY_PLAN_LIMIT: your plan allows % staff places (you have %). Remove a staff member or upgrade to add another.',
      v_max, v_count;
  end if;

  return new;
end;
$func$;

drop trigger if exists enforce_agency_staff_limit_members on public.agency_members;
create trigger enforce_agency_staff_limit_members
  before insert or update on public.agency_members
  for each row execute function public.enforce_agency_staff_limit();

-- ── Preview RPC for the billing UI / a pre-flight check before inviting ─────
create or replace function public.agency_plan_change_check(p_target text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_agency uuid := public.current_agency_id();
  v_active integer;
  v_max    integer;
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  select max_staff into v_max from public.agency_plan_limits where plan = p_target;
  if not found then
    raise exception 'Unknown plan: %', p_target;
  end if;

  v_active := public.active_staff_count(v_agency);

  return jsonb_build_object(
    'target',    p_target,
    'active',    v_active,
    'max_staff', v_max,
    'over',      case when v_max is null then 0 else greatest(0, v_active - v_max) end,
    'ok',        v_max is null or v_active <= v_max
  );
end;
$func$;

revoke execute on function public.agency_plan_change_check(text) from public;
grant execute on function public.agency_plan_change_check(text) to authenticated;

notify pgrst, 'reload schema';
