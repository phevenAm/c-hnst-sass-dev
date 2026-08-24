-- Stripe keeps a subscription's status as "active" (or "trialing") right up until
-- the current billing period actually ends, even after the customer cancels via the
-- billing portal (cancel_at_period_end: true). The webhook only ever wrote
-- subscription_status, so Settings > Subscription had no way to distinguish
-- "active, staying" from "active, cancels on <date>" — it just read "Active" either way.
alter table public.practice_settings
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_current_period_end timestamptz;
