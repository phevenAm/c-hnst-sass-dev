-- ─────────────────────────────────────────────────────────────────────────────
-- Marking an invoice paid now also drops the client an in-app notification,
-- and `invoices` joins the realtime publication so the client's dashboard card
-- updates live (no reload) when the admin marks it paid.
--
-- Only `_mark_invoice_paid_impl` changes — both callers (`mark_invoice_paid`
-- for the admin UI, `mark_invoice_paid_system` for the Stripe webhook) go
-- through it, so both paths notify.
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

  -- Tell the client — they see it in the bell and can dismiss the dashboard
  -- card once it clears.
  if v_inv.client_id is not null then
    insert into public.notifications (user_id, type, message, url)
    values (
      v_inv.client_id,
      'invoice',
      'Payment received for invoice ' || v_inv.reference || ' — thank you.',
      '/dashboard#invoices'
    );
  end if;
end;
$func$;

revoke all on function public._mark_invoice_paid_impl(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public._mark_invoice_paid_impl(uuid, timestamptz, text) to service_role;

-- ── realtime: the client's ClientInvoicesCard subscribes to its own rows ────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invoices'
  ) then
    alter publication supabase_realtime add table public.invoices;
  end if;
end $$;

notify pgrst, 'reload schema';
