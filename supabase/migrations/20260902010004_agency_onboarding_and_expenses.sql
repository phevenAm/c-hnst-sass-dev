-- ─────────────────────────────────────────────────────────────────────────────
-- Agencies, part 5 of 5: onboarding material + finance.
--
--   * agency_onboarding_items — content a manager writes for new CLIENTS or new
--     ADMINS (title + body + optional link). Members can read; managers write.
--   * agency_expenses          — the outgoings side of the finance screen.
--   * agency_finance_summary() — income (payments across member admins) vs
--     outgoings (expenses) for a date range, manager-only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agency_onboarding_items ────────────────────────────────────────────────
create table if not exists public.agency_onboarding_items (
  id         uuid        primary key default gen_random_uuid(),
  agency_id  uuid        not null references public.agencies(id) on delete cascade,
  audience   text        not null check (audience in ('client', 'admin')),
  title      text        not null,
  body       text,
  url        text,
  sort_order integer     not null default 0,
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agency_onboarding_items_agency_idx
  on public.agency_onboarding_items (agency_id, audience, sort_order);

drop trigger if exists agency_onboarding_items_set_updated_at on public.agency_onboarding_items;
create trigger agency_onboarding_items_set_updated_at
  before update on public.agency_onboarding_items
  for each row execute function public.set_updated_at();

alter table public.agency_onboarding_items enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_onboarding_items'
      and policyname='members read agency onboarding') then
    execute $pol$
      create policy "members read agency onboarding" on public.agency_onboarding_items
        for select to authenticated
        using (agency_id = public.current_agency_id())
    $pol$;
  end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_onboarding_items'
      and policyname='managers write agency onboarding') then
    execute $pol$
      create policy "managers write agency onboarding" on public.agency_onboarding_items
        for all to authenticated
        using (agency_id = public.current_agency_id() and public.is_agency_manager())
        with check (agency_id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;
end $func$;

grant select, insert, update, delete on public.agency_onboarding_items to authenticated;

-- ── agency_expenses ────────────────────────────────────────────────────────
create table if not exists public.agency_expenses (
  id           uuid        primary key default gen_random_uuid(),
  agency_id    uuid        not null references public.agencies(id) on delete cascade,
  incurred_on  date        not null default current_date,
  category     text,
  amount_pence integer     not null default 0,
  note         text,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists agency_expenses_agency_idx on public.agency_expenses (agency_id, incurred_on);

alter table public.agency_expenses enable row level security;

do $func$
begin
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='agency_expenses'
      and policyname='managers manage agency expenses') then
    execute $pol$
      create policy "managers manage agency expenses" on public.agency_expenses
        for all to authenticated
        using (agency_id = public.current_agency_id() and public.is_agency_manager())
        with check (agency_id = public.current_agency_id() and public.is_agency_manager())
    $pol$;
  end if;
end $func$;

grant select, insert, update, delete on public.agency_expenses to authenticated;

-- ── agency_finance_summary(from, to) ───────────────────────────────────────
-- Manager-only. Income = manual payments recorded by any member admin in the
-- window; outgoings = agency_expenses in the window. Payments have no per-row
-- agency tag, so we resolve membership through agency_members at query time.
create or replace function public.agency_finance_summary(
  p_from date default (current_date - interval '30 days')::date,
  p_to   date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  v_agency  uuid := public.current_agency_id();
  v_income  bigint;
  v_out     bigint;
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  select coalesce(sum(p.amount_pence), 0) into v_income
  from public.payments p
  join public.agency_members m on m.user_id = p.admin_id
  where m.agency_id = v_agency
    and p.paid_at >= p_from
    and p.paid_at < (p_to + 1);

  select coalesce(sum(e.amount_pence), 0) into v_out
  from public.agency_expenses e
  where e.agency_id = v_agency
    and e.incurred_on >= p_from
    and e.incurred_on <= p_to;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'income_pence', v_income,
    'outgoings_pence', v_out,
    'net_pence', v_income - v_out
  );
end;
$func$;

revoke execute on function public.agency_finance_summary(date, date) from anon;
grant  execute on function public.agency_finance_summary(date, date) to authenticated;

notify pgrst, 'reload schema';
