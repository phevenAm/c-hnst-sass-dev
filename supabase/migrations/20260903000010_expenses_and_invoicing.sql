-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses + Invoicing for solo practitioners.
--
-- Deliberately NOT a bookkeeping suite: no tax-authority categories, no filing,
-- no HMRC/MTD. Just — log outgoings, raise an invoice, mark it paid. Marking an
-- invoice paid drops a row into `payments`, so the existing payment ledger view
-- and the dashboard revenue charts pick invoiced income up with no extra wiring.
--
--   expenses            — one outgoing (date, category, amount, optional receipt)
--   invoices            — header row; total_pence kept in sync by trigger
--   invoice_line_items  — the billed lines; may soft-link to a session
--   allocate_invoice_number() — per-practice sequence, gap-free-ish
--   mark_invoice_paid()       — status → paid + mirror into public.payments
-- ─────────────────────────────────────────────────────────────────────────────

-- ── expenses ────────────────────────────────────────────────────────────────
create table public.expenses (
  id            uuid        primary key default gen_random_uuid(),
  admin_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  incurred_on   date        not null default current_date,
  category      text        not null default 'Other',
  amount_pence  integer     not null default 0 check (amount_pence >= 0),
  description   text,
  receipt_url   text,        -- public URL of a file in the `documents` bucket, nullable
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index expenses_admin_date_idx on public.expenses (admin_id, incurred_on desc);

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

create policy "admins manage own expenses"
  on public.expenses for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- ── invoices ────────────────────────────────────────────────────────────────
create table public.invoices (
  id            uuid        primary key default gen_random_uuid(),
  admin_id      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  client_id     uuid        references public.users(id) on delete set null,
  stub_id       uuid        references public.client_stubs(id) on delete set null,
  number        integer     not null,          -- raw per-practice sequence value
  reference     text        not null,          -- formatted for display, e.g. "INV-0007"
  status        text        not null default 'draft'
                  check (status in ('draft', 'sent', 'paid', 'void')),
  issue_date    date        not null default current_date,
  due_date      date,
  notes         text,
  total_pence   integer     not null default 0, -- maintained by recalc_invoice_total()
  sent_at       timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (admin_id, number)
);

create index invoices_admin_idx on public.invoices (admin_id, issue_date desc);

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

create policy "admins manage own invoices"
  on public.invoices for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- ── invoice_line_items ──────────────────────────────────────────────────────
create table public.invoice_line_items (
  id                uuid        primary key default gen_random_uuid(),
  invoice_id        uuid        not null references public.invoices(id) on delete cascade,
  description       text        not null default '',
  quantity          numeric     not null default 1 check (quantity > 0),
  unit_amount_pence integer     not null default 0,
  session_id        uuid,        -- soft link to sessions.id; no FK (session may be deleted)
  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id, sort_order);

alter table public.invoice_line_items enable row level security;

-- Line items inherit access from their parent invoice.
create policy "admins manage own invoice line items"
  on public.invoice_line_items for all
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_line_items.invoice_id and i.admin_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_line_items.invoice_id and i.admin_id = auth.uid()
  ));

-- ── keep invoices.total_pence in sync with its line items ───────────────────
create or replace function public.recalc_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i
  set total_pence = coalesce((
        select round(sum(li.quantity * li.unit_amount_pence))
        from public.invoice_line_items li
        where li.invoice_id = v_invoice
      ), 0)
  where i.id = v_invoice;
  return null;
end;
$func$;

create trigger invoice_line_items_recalc
  after insert or update or delete on public.invoice_line_items
  for each row execute function public.recalc_invoice_total();

-- ── per-practice invoice numbering ─────────────────────────────────────────
alter table public.practice_settings
  add column if not exists next_invoice_number integer not null default 1,
  add column if not exists invoice_prefix      text    not null default 'INV-';

-- Returns the next number for the calling practice and advances the counter.
-- Creates a practice_settings row if somehow absent (shouldn't be — every
-- admin gets one at signup).
create or replace function public.allocate_invoice_number()
returns integer
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_n integer;
begin
  update public.practice_settings
     set next_invoice_number = next_invoice_number + 1
   where admin_id = auth.uid()
  returning next_invoice_number - 1 into v_n;

  if v_n is null then
    insert into public.practice_settings (admin_id, next_invoice_number)
    values (auth.uid(), 2)
    on conflict (admin_id)
      do update set next_invoice_number = public.practice_settings.next_invoice_number + 1
    returning next_invoice_number - 1 into v_n;
  end if;

  return v_n;
end;
$func$;

revoke execute on function public.allocate_invoice_number() from anon;
grant  execute on function public.allocate_invoice_number() to authenticated;

-- ── mark an invoice paid + mirror the amount into public.payments ──────────
create or replace function public.mark_invoice_paid(
  p_invoice_id uuid,
  p_paid_at    timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_inv public.invoices;
begin
  select * into v_inv
  from public.invoices
  where id = p_invoice_id and admin_id = auth.uid();

  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_inv.status = 'paid' then
    return;
  end if;

  update public.invoices
     set status = 'paid', paid_at = p_paid_at
   where id = p_invoice_id;

  insert into public.payments (admin_id, client_id, stub_id, amount_pence, description, paid_at)
  values (v_inv.admin_id, v_inv.client_id, v_inv.stub_id, v_inv.total_pence,
          'Invoice ' || v_inv.reference, p_paid_at);
end;
$func$;

revoke execute on function public.mark_invoice_paid(uuid, timestamptz) from anon;
grant  execute on function public.mark_invoice_paid(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
