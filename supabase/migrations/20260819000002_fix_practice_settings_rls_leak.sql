-- practice_settings had a leftover blanket SELECT policy ("authenticated
-- users can read practice settings", USING (auth.uid() IS NOT NULL)) from
-- before per-admin scoping existed. Permissive RLS policies OR together, so
-- this silently overrode the later, correctly-scoped "admins select own
-- practice_settings" policy: any signed-in user of ANY practice could read
-- every other practice's row — bank account details, Stripe Connect account
-- IDs, billing customer IDs, and note-encryption key material included.
-- Found via e2e/stripe/stripe.spec.ts, which expected exactly one row back
-- for the signed-in admin and got six.
--
-- Clients legitimately need to read their own counsellor's row (bank
-- transfer details, cutoff hours, etc. — see PaymentModal.tsx), so the
-- replacement policy scopes that read to "your own admin's row" rather than
-- dropping client access entirely.

drop policy if exists "authenticated users can read practice settings" on public.practice_settings;

do $func$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'practice_settings'
      and policyname = 'clients read their own admin practice_settings'
  ) then
    execute $pol$
      create policy "clients read their own admin practice_settings"
        on public.practice_settings
        for select
        to authenticated
        using (
          admin_id = (select admin_id from public.users where id = auth.uid())
        )
    $pol$;
  end if;
end $func$;
