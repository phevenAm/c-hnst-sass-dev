-- Usage-based subscription tiers.
--
-- Replaces the legacy website / app / bundle products with three
-- client-count tiers. Pricing is per ACTIVE client; every tier also allows
-- the same number again as archived (deactivated) clients at no extra cost.
--
-- There are no paying subscribers yet, so legacy plan values are remapped to
-- 'starter' rather than preserved. The client-limit enforcement functions
-- and triggers land in a later migration (they depend on users.archived_at
-- from the client-lifecycle migrations, 20260901000000+).

-- 1. Retire the old plan vocabulary on practice_settings ---------------------
alter table public.practice_settings
  alter column subscription_plan drop default;

update public.practice_settings
set subscription_plan = 'starter'
where subscription_plan is null
   or subscription_plan not in ('starter', 'growth', 'unlimited');

alter table public.practice_settings
  alter column subscription_plan set default 'starter';

alter table public.practice_settings
  drop constraint if exists practice_settings_subscription_plan_check;

alter table public.practice_settings
  add constraint practice_settings_subscription_plan_check
  check (subscription_plan in ('starter', 'growth', 'unlimited'));

comment on column public.practice_settings.subscription_plan is
  'Usage tier: starter | growth | unlimited. See public.plan_limits for capacity.';

-- 2. Billing cadence -------------------------------------------------------------
--    Lets the app render "/mo" vs "/yr" and tells the change-plan flow which
--    Stripe price (monthly vs annual) to switch to.
alter table public.practice_settings
  add column if not exists billing_interval text not null default 'month';

alter table public.practice_settings
  drop constraint if exists practice_settings_billing_interval_check;

alter table public.practice_settings
  add constraint practice_settings_billing_interval_check
  check (billing_interval in ('month', 'year'));

-- 3. plan_limits: one source of truth for tier capacity ------------------------
--    Read by the enforcement functions, the in-app subscription screen, and
--    (mirrored by hand in index.html) the marketing calculator.
--    NULL max_* = unlimited.
create table if not exists public.plan_limits (
  plan          text primary key,
  max_active    integer,
  max_archived  integer,
  sort_order    integer not null default 0
);

insert into public.plan_limits (plan, max_active, max_archived, sort_order) values
  ('starter',   5,    5,    1),
  ('growth',    15,   15,   2),
  ('unlimited', null, null, 3)
on conflict (plan) do update
  set max_active   = excluded.max_active,
      max_archived = excluded.max_archived,
      sort_order   = excluded.sort_order;

alter table public.plan_limits enable row level security;

drop policy if exists "plan_limits readable by authenticated" on public.plan_limits;
create policy "plan_limits readable by authenticated"
  on public.plan_limits for select
  to authenticated
  using (true);

grant select on public.plan_limits to authenticated;
