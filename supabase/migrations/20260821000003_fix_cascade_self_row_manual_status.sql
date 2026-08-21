-- Bug caught by a new e2e test ("unmarking one paid block session as
-- unpaid reverts the whole block"): cascade_block_payment's cascading
-- UPDATE filtered siblings by `where paid = true` (unpaid direction) /
-- `where paid = false` (paid direction) — which excludes the row that
-- actually fired the trigger, since ITS paid column already matches the
-- new value by the time the trigger runs. The direct caller (e.g.
-- SessionCard's admin toggle, a plain `update sessions set paid = true`)
-- never touches manual_payment_status itself, so the triggering row's own
-- manual_payment_status was left stuck at whatever it was before — only
-- its siblings got normalized. Same gap in both directions; fixing both.
-- `or id = new.id` folds the triggering row into the same statement so its
-- manual_payment_status gets normalized too, without affecting the
-- self-terminating property (a second pass on new.id's own row is a no-op
-- on `paid`, so the trigger's own old.paid/new.paid condition won't match
-- again on the recursive firing).
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
        and (paid = false or id = new.id);
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
        and (paid = true or id = new.id);
    end if;
  end if;
  return new;
end;
$func$;
