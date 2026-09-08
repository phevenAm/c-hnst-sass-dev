-- ─────────────────────────────────────────────────────────────────────────────
-- Marking an invoice paid now also settles the sessions billed on it, and the
-- Stripe webhook gets a path to do the same.
--
-- Why: invoices and sessions carry separate paid states. An invoice line can
-- soft-link a session (invoice_line_items.session_id), but mark_invoice_paid()
-- only flipped the invoice — a session bundled onto a paid invoice still showed
-- as owing on /my-sessions and in the dashboards, and a client could pay it
-- again there. Now paying the invoice clears those sessions too.
--
-- Split into:
--   _impl(id, paid_at, payment_intent) — the actual work, no auth check. Runs
--     as owner (bypasses RLS). Granted to service_role only, plus called by the
--     authed wrapper below.
--   mark_invoice_paid(id, paid_at) — unchanged signature, unchanged caller
--     contract (admin UI): still checks admin_id = auth.uid(), then delegates.
--   mark_invoice_paid_system(id, paid_at, payment_intent) — for stripe-webhook,
--     which runs as service_role with no auth.uid(). service_role only.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public._mark_invoice_paid_impl(
  p_invoice_id     uuid,
  p_paid_at        timestamptz,
  p_payment_intent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_inv.status = 'paid' then
    return;                       -- idempotent: webhook retries, double-clicks
  end if;

  update public.invoices
     set status = 'paid', paid_at = p_paid_at
   where id = p_invoice_id;

  insert into public.payments (admin_id, client_id, stub_id, amount_pence, description, paid_at)
  values (v_inv.admin_id, v_inv.client_id, v_inv.stub_id, v_inv.total_pence,
          'Invoice ' || v_inv.reference, p_paid_at);

  -- Settle every still-unpaid session this invoice bills for. Scoped to the
  -- invoice's own practice; no per-session payments row (the single "Invoice …"
  -- row above is the money record).
  update public.sessions s
     set paid = true,
         stripe_payment_intent_id = coalesce(s.stripe_payment_intent_id, p_payment_intent)
   where s.created_by = v_inv.admin_id
     and s.paid is not true
     and s.id in (
       select li.session_id
       from public.invoice_line_items li
       where li.invoice_id = p_invoice_id and li.session_id is not null
     );
end;
$func$;

revoke all on function public._mark_invoice_paid_impl(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public._mark_invoice_paid_impl(uuid, timestamptz, text) to service_role;

-- ── authed wrapper — admin "Mark paid" in the invoices table ────────────────
create or replace function public.mark_invoice_paid(
  p_invoice_id uuid,
  p_paid_at    timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  if not exists (
    select 1 from public.invoices
    where id = p_invoice_id and admin_id = auth.uid()
  ) then
    raise exception 'Invoice not found';
  end if;
  perform public._mark_invoice_paid_impl(p_invoice_id, p_paid_at, null);
end;
$func$;

revoke execute on function public.mark_invoice_paid(uuid, timestamptz) from anon, public;
grant  execute on function public.mark_invoice_paid(uuid, timestamptz) to authenticated;

-- ── system path — stripe-webhook (runs as service_role, no auth.uid()) ─────
create or replace function public.mark_invoice_paid_system(
  p_invoice_id     uuid,
  p_paid_at        timestamptz default now(),
  p_payment_intent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  perform public._mark_invoice_paid_impl(p_invoice_id, p_paid_at, p_payment_intent);
end;
$func$;

revoke all on function public.mark_invoice_paid_system(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.mark_invoice_paid_system(uuid, timestamptz, text) to service_role;

notify pgrst, 'reload schema';
