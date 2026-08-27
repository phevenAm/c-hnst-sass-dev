-- Paused clients (users.disabled = true, role = 'client') are signed out of
-- the app by AuthContext, and can't sign back in. But the JWT they already
-- hold stays valid until it expires (~1h), so a direct API call with that
-- token would still pass RLS. This adds a database-level backstop.
--
-- RESTRICTIVE policies are AND'd with the existing PERMISSIVE ones, so this is
-- purely additive: it can only tighten, never loosen. It's scoped to the
-- tables a client writes to. `users` is deliberately left untouched so the
-- app can still read users.disabled to show the "paused" message, and so an
-- admin can still flip the flag back.

create or replace function public.is_paused_client()
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'client'
      and disabled is true
  );
$func$;

comment on function public.is_paused_client() is
  'True when the caller is a client whose access has been paused (users.disabled). Backstop for the ~1h JWT window after an admin pauses a client.';

revoke all on function public.is_paused_client() from public, anon;
grant execute on function public.is_paused_client() to authenticated;

do $blk$
declare
  t text;
begin
  foreach t in array array[
    'responses',
    'journal_entries',
    'reschedule_requests',
    'cancellation_requests',
    'resource_favourites'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'block paused clients', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      || 'using (not public.is_paused_client()) with check (not public.is_paused_client())',
      'block paused clients', t
    );
  end loop;
end
$blk$;
