-- Separate session fee from payment status on stub_sessions.
-- Previously amount_paid doubled as "the fee charged" which meant entering
-- any price instantly marked the session as paid — wrong behaviour.
--
-- New shape mirrors real sessions: price_pence = the fee, paid = whether
-- it has been collected. Existing rows with amount_paid set are migrated
-- to paid=true with price_pence derived from the existing value.

alter table public.stub_sessions
  add column if not exists price_pence integer,
  add column if not exists paid boolean not null default false;

-- Migrate existing data: treat any non-null amount_paid as "paid in full".
update public.stub_sessions
  set
    price_pence = round(amount_paid * 100)::integer,
    paid        = true
  where amount_paid is not null;
