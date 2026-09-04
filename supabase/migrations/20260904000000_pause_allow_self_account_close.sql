-- ─────────────────────────────────────────────────────────────────────────────
-- Pause carve-out: let a user still close their OWN account while paused.
--
-- block_paused_write (20260826000000) fires on `public.users` too, and
-- delete_own_account() deletes from public.users. get_my_is_paused() reads
-- auth.uid() from the request JWT, which SECURITY DEFINER does not reset — so
-- inside delete_own_account() a paused admin still trips the trigger and gets
-- "This account is paused. Contact support to resume." The Delete-account
-- button sits right there in the (paused) Billing tab, so this is a dead end.
--
-- Fix: while paused, still allow any write to the caller's OWN users row.
-- That covers delete_own_account() (admin hard-delete + client self-archive)
-- and anonymise_client(auth.uid()) on the self-close path. It does NOT loosen
-- anything else — a paused admin still can't touch client rows, sessions,
-- payments, notes, etc.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.block_paused_write()
returns trigger
language plpgsql
as $func$
begin
  if public.get_my_is_paused() then
    -- Your own users row stays writable: closing / anonymising your account
    -- must not be trapped behind "resume first", and editing your own profile
    -- isn't what pausing is meant to stop.
    if tg_table_name = 'users' and coalesce(new.id, old.id) = auth.uid() then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    raise exception 'This account is paused. Contact support to resume.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$func$;
