-- Real-client block sessions already cascade a paid-status change to every
-- sibling in the block via sessions_cascade_block_payment (20260820000005 /
-- 20260821000002-3) — but that trigger was only ever attached to
-- public.sessions. Offline-client (stub) sessions have their own identical
-- "N sessions paid as one block" UI (StubBlockSessionCard) with no such
-- trigger, so marking one session in a stub block as paid — or unpaid — left
-- every sibling exactly as it was: "the paid buttons behave independently of
-- the entire block."
--
-- stub_sessions also has the amount_paid vs paid dual-signal that plain
-- sessions doesn't (see 20260826000004): AdminPaymentsPage's own "Mark
-- paid" flow sets amount_paid, never paid, so the cascade has to treat
-- either signal becoming true as "the block just got paid", not just the
-- paid column. There's no manual_payment_status column on stub_sessions
-- (offline clients don't request/approve payments themselves), so unlike
-- the sessions version there's nothing else to normalize on the triggering
-- row itself — the cascade only ever needs to touch siblings.
--
-- Self-terminating the same way as the sessions trigger: the cascading
-- UPDATE only matches rows whose own paid signal doesn't already agree with
-- the new state, so once every sibling agrees there's nothing left to match
-- and the recursive AFTER UPDATE firings stop.

create or replace function public.cascade_stub_block_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_block_id text;
  v_old_paid boolean;
  v_new_paid boolean;
begin
  v_old_paid := coalesce(old.paid, false) or (old.amount_paid is not null and old.amount_paid > 0);
  v_new_paid := coalesce(new.paid, false) or (new.amount_paid is not null and new.amount_paid > 0);

  if v_new_paid and not v_old_paid then
    v_block_id := new.metadata->>'block_id';
    if v_block_id is not null then
      update public.stub_sessions
      set paid = true
      where stub_id = new.stub_id
        and metadata->>'block_id' = v_block_id
        and id <> new.id
        and not (coalesce(paid, false) or (amount_paid is not null and amount_paid > 0));
    end if;
  elsif v_old_paid and not v_new_paid then
    v_block_id := new.metadata->>'block_id';
    if v_block_id is not null then
      update public.stub_sessions
      set paid = false,
          amount_paid = null
      where stub_id = new.stub_id
        and metadata->>'block_id' = v_block_id
        and id <> new.id
        and (coalesce(paid, false) or (amount_paid is not null and amount_paid > 0));
    end if;
  end if;
  return new;
end;
$func$;

drop trigger if exists stub_sessions_cascade_block_payment on public.stub_sessions;
create trigger stub_sessions_cascade_block_payment
  after update on public.stub_sessions
  for each row execute function public.cascade_stub_block_payment();
