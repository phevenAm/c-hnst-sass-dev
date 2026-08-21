-- Card payment (Stripe) was always offered as a tab in PaymentModal once an
-- admin had connected Stripe, with no way to turn it back off — clients
-- would see "Pay with Stripe" and only find out it doesn't work after
-- clicking through and hitting a checkout error. Separating "connected" from
-- "actually offered to clients" so an admin can connect Stripe (e.g. to test
-- it) without it being live for clients, and can turn it off later without
-- disconnecting. Default false: existing admins with Stripe connected keep
-- their current behaviour dark until they explicitly opt in, rather than a
-- migration silently changing what their clients see.
alter table public.practice_settings
  add column if not exists card_payments_enabled boolean not null default false;
