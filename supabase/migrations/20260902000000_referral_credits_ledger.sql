-- Referral credits ledger.
--
-- Previously the referrer's 2-month balance credit was applied immediately in
-- the stripe-webhook `checkout.session.completed` handler and never reversed.
-- That let anyone farm credit: subscribe with a referral code, get the
-- referrer credited, then cancel/refund the next day. Self-referral (signing
-- up new accounts with your own code) had no guard at all.
--
-- This table decouples "a referral was recorded" from "the referrer was paid":
--
--   pending   -> referral recorded at checkout, not yet earned
--   claimed   -> a webhook is mid-grant (transient lock, avoids double credit
--                on concurrent Stripe redeliveries)
--   granted   -> balance credit applied; stripe_balance_txn_id is the proof
--   rejected  -> disqualified (self-referral, or referrer no longer subscribed)
--
-- The credit is granted from the webhook when the REFERRED practice pays its
-- first renewal invoice (billing_reason = 'subscription_cycle') — proof the
-- subscription survived a full billing period rather than being an instant
-- refund. See supabase/functions/stripe-webhook/index.ts.

create table if not exists public.referral_credits (
  id                     uuid        primary key default gen_random_uuid(),
  -- The newly-subscribed practice that used a referral link. One credit per
  -- referred practice, ever — the unique constraint makes the checkout-time
  -- insert idempotent across re-subscribes and Stripe event redeliveries.
  referred_admin_id      uuid        not null references public.users(id) on delete cascade,
  -- Resolved from the referral code at checkout time and frozen here, so a
  -- later code rotation or the referrer editing their settings can't move the
  -- payout target.
  referrer_admin_id      uuid        not null references public.users(id) on delete cascade,
  referral_code          text        not null,
  status                 text        not null default 'pending'
                           check (status in ('pending', 'claimed', 'granted', 'rejected')),
  -- Populated only on grant.
  credit_amount_pence    integer,
  stripe_balance_txn_id  text,
  -- Populated only on reject: 'self_same_account' | 'self_same_customer'
  -- | 'self_same_email' | 'referrer_not_subscribed'.
  rejected_reason        text,
  created_at             timestamptz not null default now(),
  granted_at             timestamptz,
  unique (referred_admin_id)
);

create index if not exists referral_credits_referrer_idx
  on public.referral_credits (referrer_admin_id);

alter table public.referral_credits enable row level security;

-- The referrer may see the credits they've earned (for a future "your
-- referrals" panel in Settings). Nobody can see a row as the referred party —
-- there's nothing actionable there and it leaks who referred whom.
drop policy if exists "referral_credits readable by referrer" on public.referral_credits;
create policy "referral_credits readable by referrer"
  on public.referral_credits for select
  to authenticated
  using (referrer_admin_id = auth.uid());

-- No insert/update/delete policies: only the service-role stripe-webhook
-- mutates this table, and service-role bypasses RLS.

grant select on public.referral_credits to authenticated;
