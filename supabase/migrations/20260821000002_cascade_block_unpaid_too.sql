-- cascade_block_payment (20260820000005) only cascaded paid false->true —
-- an admin reversing that on a single session via SessionCard's own "Mark
-- as unpaid" toggle (a plain paid:true->false update, same call site as
-- the "mark paid" direction) left the rest of the block still paid,
-- breaking the atomic-block invariant the whole cascade exists to protect.
-- Mirrors the same shape for the reverse direction: reset the block back to
-- unpaid, and drop manual_payment_status back to 'none' rather than leaving
-- it at 'approved' — an unpaid session shouldn't look like it has a live
-- approved claim sitting on it.
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
  elsif new.paid = false and coalesce(old.paid, false) = true then
    v_block_id := new.metadata->>'block_id';
    if v_block_id is not null then
      update public.sessions
      set paid = false,
          paid_at = null,
          manual_payment_status = case when manual_payment_status = 'approved' then 'none' else manual_payment_status end
      where client_id = new.client_id
        and metadata->>'block_id' = v_block_id
        and paid = true;
    end if;
  end if;
  return new;
end;
$func$;
