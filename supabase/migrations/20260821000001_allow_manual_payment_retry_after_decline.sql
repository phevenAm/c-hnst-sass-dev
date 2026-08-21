-- request_manual_payment()'s eligibility guard required
-- manual_payment_status = 'none' — but respond_manual_payment()'s decline
-- branch sets it to 'declined' and never resets it. Once an admin declined
-- a manual payment claim, the client could never request it again: not a
-- "try a different method" dead end (Stripe still works — it doesn't check
-- this column — and an admin can always mark it paid directly), but the
-- bank-transfer retry path specifically was permanently blocked, which
-- doesn't match the actual intent: a decline should mean "that particular
-- claim wasn't verified," not "this session can never be paid by transfer
-- again." Widening the guard to also accept 'declined' lets a client
-- re-request after fixing whatever the admin flagged (wrong reference,
-- wrong amount, etc.).
create or replace function public.request_manual_payment(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_block_id text;
begin
  if not exists (
    select 1 from public.sessions
    where id = p_session_id
      and client_id = auth.uid()
      and status = 'scheduled'
      and paid = false
      and manual_payment_status in ('none', 'declined')
  ) then
    raise exception 'Session not found, already paid, or manual payment already requested';
  end if;

  select metadata->>'block_id' into v_block_id
  from public.sessions
  where id = p_session_id;

  if v_block_id is not null then
    update public.sessions
    set manual_payment_status = 'pending'
    where client_id = auth.uid()
      and metadata->>'block_id' = v_block_id
      and status = 'scheduled'
      and paid = false
      and manual_payment_status in ('none', 'declined');
  else
    update public.sessions
    set manual_payment_status = 'pending'
    where id = p_session_id;
  end if;
end;
$func$;
