-- Bug caught by e2e/settings/settings-behavior.spec.ts ("Block payment
-- cascade"): notify_admin_manual_payment_pending() (20260820000004) used
-- `select min(id) from sessions where ...` to deterministically pick one
-- session per block to notify on — but sessions.id is uuid, and Postgres
-- has no min() aggregate for uuid. Every manual-payment-pending transition
-- on a BLOCK session (i.e. exactly the case this dedup logic exists for)
-- threw "function min(uuid) does not exist" inside the trigger, which
-- aborted the whole UPDATE and rolled back the payment status change too —
-- so request_manual_payment() silently failed for every block booking
-- since the trigger was added. Single-session payments were unaffected
-- (v_block_id is null there, the min() branch never runs).
--
-- Fix: cast to text for the comparison — still fully deterministic (same
-- session picked every time, block-wide), just not numeric ordering.
create or replace function public.notify_admin_manual_payment_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_client_name text;
  v_block_id    text;
begin
  if new.manual_payment_status = 'pending'
     and coalesce(old.manual_payment_status, '') <> 'pending'
     and new.created_by is not null
  then
    v_block_id := new.metadata->>'block_id';

    if v_block_id is not null and new.id <> (
      select min(id::text)::uuid from public.sessions
      where client_id = new.client_id and metadata->>'block_id' = v_block_id
    ) then
      return new;
    end if;

    select coalesce(first_name, 'A client') into v_client_name
    from public.users
    where id = new.client_id;

    insert into public.notifications (user_id, type, message, url)
    values (
      new.created_by,
      'manual_payment_pending',
      v_client_name || ' marked ' || case when v_block_id is not null then 'a block of sessions' else 'a session' end
        || ' as paid by bank transfer — needs your confirmation',
      '/admin/payments'
    );
  end if;
  return new;
end;
$func$;
