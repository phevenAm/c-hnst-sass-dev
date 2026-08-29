-- Recurring/block config for a session type.
--
-- Context: a "block" booking (e.g. 4 weekly sessions paid for as one unit)
-- was previously driven by an ad-hoc "Book as a recurring block" checkbox on
-- CreateSessionModal, with the admin retyping the count and price every time.
-- That put the block price on every session row unchanged, so each session
-- read as the full block price and create-checkout-session (which sums
-- price_pence across a block) over-charged.
--
-- This moves the decision onto the session type itself:
--   * is_recurring   — this type is always booked as a block
--   * session_count  — how many sessions the block contains (weekly cadence,
--                      same as the old checkbox flow: first date + N-1 more)
--
-- price_pence keeps its meaning (the amount the admin typed) but for a
-- recurring type it is understood as the WHOLE-BLOCK price. The booking form
-- is responsible for dividing it across the individual session rows so each
-- row carries its own per-session fee and the block sum stays correct.
alter table public.session_packages
  add column if not exists is_recurring  boolean not null default false,
  add column if not exists session_count integer not null default 1;

-- A recurring type needs at least 2 sessions; a non-recurring one is always 1.
alter table public.session_packages
  add constraint session_packages_session_count_check
  check (
    (is_recurring = false and session_count = 1)
    or (is_recurring = true and session_count between 2 and 52)
  );

notify pgrst, 'reload schema';
