-- Block sessions are paid for as one unit (one Stripe Checkout, or one bank
-- transfer covering the whole block — see 20260819000006_block_aware_manual_
-- payment.sql), but that block-awareness only existed in the manual-payment
-- request/approve RPCs. Every other path that can flip sessions.paid to
-- true — the admin's own "Mark as paid" toggle in SessionCard (a plain
-- Redux updateSession, no RPC involved), and the Stripe webhook if it's
-- ever called for a single session id — only touched the one row, leaving
-- the rest of a paid block showing unpaid with no way to catch up short of
-- clicking every sibling individually.
--
-- A trigger closes this for every path at once instead of chasing down each
-- call site. It's self-terminating: the cascading UPDATE only ever touches
-- rows still paid = false, so once a block is fully paid there's nothing
-- left to match and the recursive AFTER UPDATE firings stop.

create or replace function public.cascade_block_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_block_id text;
begin
  if new.paid = true and coalesce(old.paid, false) = false then
    v_block_id := new.metadata->>'block_id';
    if v_block_id is not null then
      update public.sessions
      set paid = true,
          paid_at = coalesce(new.paid_at, now()),
          manual_payment_status = case when manual_payment_status = 'pending' then 'approved' else manual_payment_status end
      where client_id = new.client_id
        and metadata->>'block_id' = v_block_id
        and paid = false;
    end if;
  end if;
  return new;
end;
$func$;

drop trigger if exists sessions_cascade_block_payment on public.sessions;
create trigger sessions_cascade_block_payment
  after update on public.sessions
  for each row execute function public.cascade_block_payment();
