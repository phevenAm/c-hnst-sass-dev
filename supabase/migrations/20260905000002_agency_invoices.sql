-- ─────────────────────────────────────────────────────────────────────────────
-- Agency invoices: what a MEMBER owes the AGENCY (typically a freelancer's
-- seat/referral fee) — a distinct financial relationship from:
--   * public.invoices        — a member billing their OWN client
--   * public.agency_expenses — the agency's own outgoings
--
-- Direction here is always staff -> agency. Deliberately NOT reusing
-- public.invoices: that table's RLS, numbering and mark_invoice_paid() all
-- assume admin_id is the issuer and client_id/stub_id is the issuer's own
-- client — a peer-billing-peer relationship doesn't fit without distorting
-- that meaning. A parallel table + its own manager/staff RLS is cleaner.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.agencies
  add column if not exists next_invoice_number integer not null default 1,
  add column if not exists invoice_prefix       text    not null default 'AGINV-';

create table public.agency_invoices (
  id            uuid        primary key default gen_random_uuid(),
  agency_id     uuid        not null references public.agencies(id) on delete cascade,
  staff_user_id uuid        references auth.users(id) on delete set null,
  issued_by     uuid        references auth.users(id) on delete set null,
  number        integer     not null,
  reference     text        not null,          -- formatted for display, e.g. "AGINV-0007"
  description   text,
  amount_pence  integer     not null default 0 check (amount_pence >= 0),
  status        text        not null default 'draft'
                  check (status in ('draft', 'sent', 'due', 'paid', 'overdue', 'cancelled')),
  issue_date    date        not null default current_date,
  due_date      date,
  sent_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (agency_id, number)
);

create index agency_invoices_agency_idx on public.agency_invoices (agency_id, issue_date desc);
create index agency_invoices_staff_idx  on public.agency_invoices (staff_user_id);

drop trigger if exists agency_invoices_updated_at on public.agency_invoices;
create trigger agency_invoices_updated_at
  before update on public.agency_invoices
  for each row execute function public.set_updated_at();

alter table public.agency_invoices enable row level security;

drop policy if exists "managers manage agency invoices" on public.agency_invoices;
create policy "managers manage agency invoices" on public.agency_invoices
  for all to authenticated
  using (agency_id = public.current_agency_id() and public.is_agency_manager())
  with check (agency_id = public.current_agency_id() and public.is_agency_manager());

drop policy if exists "staff read own agency invoices" on public.agency_invoices;
create policy "staff read own agency invoices" on public.agency_invoices
  for select to authenticated
  using (staff_user_id = auth.uid());

grant select, insert, update, delete on public.agency_invoices to authenticated;

-- ── per-agency invoice numbering (manager-only) ─────────────────────────────
create or replace function public.allocate_agency_invoice_number()
returns integer
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_agency uuid := public.current_agency_id();
  v_n integer;
begin
  if v_agency is null or not public.is_agency_manager() then
    raise exception 'Not an agency manager';
  end if;

  update public.agencies
     set next_invoice_number = next_invoice_number + 1
   where id = v_agency
  returning next_invoice_number - 1 into v_n;

  return v_n;
end;
$func$;

revoke execute on function public.allocate_agency_invoice_number() from anon;
grant  execute on function public.allocate_agency_invoice_number() to authenticated;

-- ── mark paid (manager-only; no client-payments mirror — this isn't client
-- income, it's an internal agency<->staff settlement) ──────────────────────
create or replace function public.mark_agency_invoice_paid(p_invoice_id uuid, p_paid_at timestamptz default now())
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

  update public.agency_invoices
     set status = 'paid', paid_at = p_paid_at
   where id = p_invoice_id and agency_id = v_agency
  returning id into v_found;

  if v_found is null then
    raise exception 'Invoice not found';
  end if;
end;
$func$;

revoke execute on function public.mark_agency_invoice_paid(uuid, timestamptz) from anon;
grant  execute on function public.mark_agency_invoice_paid(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
