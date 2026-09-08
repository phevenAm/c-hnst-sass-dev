-- ─────────────────────────────────────────────────────────────────────────────
-- Invoicing: a per-practice on/off switch, appearance settings, and a
-- client-facing read path.
--
-- 1. practice_settings.invoices_enabled — master switch. When false the whole
--    feature is hidden client- and admin-side (Finances "Invoices" tab, the
--    client invoice list, every "Raise invoice" entry point). Defaults true so
--    existing practices are unaffected.
--
-- 2. Appearance columns — drive the emailed invoice + the PDF without a template
--    editor: a footer line, a default payment-terms window, default notes, and
--    an accent colour for the PDF masthead. All nullable → the current
--    hard-coded look is the fallback.
--
-- 3. Client read policies — until now `invoices` / `invoice_line_items` were
--    admin-only (`for all using (admin_id = auth.uid())`), so a client could
--    only ever see an invoice as an email attachment. Add additive SELECT
--    policies (RLS combines with OR) so a client can read their OWN invoices,
--    but only once they leave `draft` — an unsent draft is still private to the
--    practitioner.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.practice_settings
  add column if not exists invoices_enabled          boolean not null default true,
  add column if not exists invoice_footer_text       text,
  add column if not exists invoice_payment_terms_days integer check (invoice_payment_terms_days is null or invoice_payment_terms_days between 0 and 365),
  add column if not exists invoice_default_notes      text,
  add column if not exists invoice_accent_hex         text check (invoice_accent_hex is null or invoice_accent_hex ~ '^#[0-9a-fA-F]{6}$');

-- ── client read: own invoices, once sent ────────────────────────────────────
drop policy if exists "clients read own invoices" on public.invoices;

create policy "clients read own invoices"
  on public.invoices for select
  using (client_id = auth.uid() and status <> 'draft');

drop policy if exists "clients read own invoice line items" on public.invoice_line_items;

create policy "clients read own invoice line items"
  on public.invoice_line_items for select
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_line_items.invoice_id
      and i.client_id = auth.uid()
      and i.status <> 'draft'
  ));

notify pgrst, 'reload schema';
