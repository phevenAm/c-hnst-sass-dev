-- ─────────────────────────────────────────────────────────────────────────────
-- Make the manual (bank transfer) payment RPCs block-aware.
--
-- Block sessions have no dedicated table — membership is a JSON convention
-- (sessions.metadata->>'block_id'), already used the same way by
-- create-checkout-session and stripe-webhook for the card path: one Stripe
-- Checkout Session for the block total, and on completion every sibling
-- session sharing that block_id gets marked paid together.
--
-- The manual-payment RPCs (20260817000008_manual_payment.sql) never got that
-- treatment — they were single-session only. A client on a block would only
-- flag the one session they clicked, and an admin approving it would only
-- mark that one session paid, leaving the rest of the block unpaid with no
-- way to catch up short of doing it per-session. This mirrors the Stripe
-- path: request/approve/decline on any session in a block now applies to
-- every eligible sibling in that block.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.request_manual_payment(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_block_id text;
begin
  -- Only the session's own client can call this, and only while eligible
  if not exists (
    select 1 from public.sessions
    where id = p_session_id
      and client_id = auth.uid()
      and status = 'scheduled'
      and paid = false
      and manual_payment_status = 'none'
  ) then
    raise exception 'Session not found, already paid, or manual payment already requested';
  end if;

  select metadata->>'block_id' into v_block_id
  from public.sessions
  where id = p_session_id;

  if v_block_id is not null then
    -- Block booking: the client is committing to pay for the whole block as
    -- one transfer, so flag every eligible sibling, not just the one clicked.
    update public.sessions
    set manual_payment_status = 'pending'
    where client_id = auth.uid()
      and metadata->>'block_id' = v_block_id
      and status = 'scheduled'
      and paid = false
      and manual_payment_status = 'none';
  else
    update public.sessions
    set manual_payment_status = 'pending'
    where id = p_session_id;
  end if;
end;
$func$;

create or replace function public.respond_manual_payment(
  p_session_id uuid,
  p_approved   boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_block_id   text;
  v_created_by uuid;
begin
  -- Admin must own this session (created_by = auth.uid())
  if not exists (
    select 1 from public.sessions
    where id = p_session_id
      and created_by = auth.uid()
      and manual_payment_status = 'pending'
  ) then
    raise exception 'Session not found or not pending manual payment approval';
  end if;

  select metadata->>'block_id', created_by into v_block_id, v_created_by
  from public.sessions
  where id = p_session_id;

  if p_approved then
    update public.sessions
    set manual_payment_status = 'approved',
        paid                  = true,
        paid_at               = now()
    where created_by = v_created_by
      and manual_payment_status = 'pending'
      and (
        (v_block_id is not null and metadata->>'block_id' = v_block_id)
        or (v_block_id is null and id = p_session_id)
      );
  else
    update public.sessions
    set manual_payment_status = 'declined'
    where created_by = v_created_by
      and manual_payment_status = 'pending'
      and (
        (v_block_id is not null and metadata->>'block_id' = v_block_id)
        or (v_block_id is null and id = p_session_id)
      );
  end if;
end;
$func$;
