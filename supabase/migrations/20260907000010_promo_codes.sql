-- Promo codes for non-subscription (access-token) signups.
--
-- A counsellor who signs up with a platform access token still hits the
-- paywall (Router SubscriptionGate) and is sent to /subscribe. A promo
-- code lets them skip payment for a fixed number of months: it flips their
-- practice to `subscription_status = 'trialing'` with an end date, which
-- the existing gate already lets through. When the date passes, a nightly
-- job drops them back to 'inactive' and the paywall re-gates.
--
-- This is intentionally decoupled from Stripe — no Checkout, no coupon
-- object. It's a manual "on the house" grant keyed off a shareable code.

create table if not exists public.promo_codes (
  code            text primary key,
  months_free     integer not null default 2 check (months_free between 1 and 24),
  active          boolean not null default true,
  max_redemptions integer,                       -- null = unlimited
  redeemed_count  integer not null default 0,
  expires_at      timestamptz,                   -- null = never expires
  note            text,
  created_at      timestamptz not null default now()
);

comment on table public.promo_codes is
  'Shareable codes that grant N months of free access on redemption. Not linked to Stripe.';

alter table public.promo_codes enable row level security;
-- No policies: the table is reached only through the SECURITY DEFINER RPCs
-- below (and service_role from the dashboard). Regular roles get nothing.

alter table public.practice_settings
  add column if not exists promo_code          text references public.promo_codes(code),
  add column if not exists promo_trial_ends_at  timestamptz;

comment on column public.practice_settings.promo_trial_ends_at is
  'When a redeemed promo code''s free period ends. expire_promo_trials() lapses the practice after this.';

-- ── redeem_promo_code(code) → the trial end timestamp ──────────────────────
create or replace function public.redeem_promo_code(p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_uid  uuid := auth.uid();
  v_code promo_codes%rowtype;
  v_ends timestamptz;
  v_settings practice_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_settings from practice_settings where admin_id = v_uid;
  if not found then
    raise exception 'Only a practice owner can redeem a promo code';
  end if;

  if v_settings.promo_code is not null then
    raise exception 'A promo code has already been applied to your practice';
  end if;
  if v_settings.stripe_subscription_id is not null or v_settings.subscription_status = 'active' then
    raise exception 'Your practice already has an active subscription';
  end if;

  select * into v_code from promo_codes where code = upper(btrim(p_code)) for update;
  if not found or not v_code.active then
    raise exception 'That code is not valid';
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    raise exception 'That code has expired';
  end if;
  if v_code.max_redemptions is not null and v_code.redeemed_count >= v_code.max_redemptions then
    raise exception 'That code has already been fully redeemed';
  end if;

  v_ends := now() + make_interval(months => v_code.months_free);

  update practice_settings
     set subscription_status = 'trialing',
         promo_code          = v_code.code,
         promo_trial_ends_at  = v_ends
   where admin_id = v_uid;

  update promo_codes set redeemed_count = redeemed_count + 1 where code = v_code.code;

  return v_ends;
end;
$func$;

revoke execute on function public.redeem_promo_code(text) from public, anon;
grant  execute on function public.redeem_promo_code(text) to authenticated;

-- ── expire_promo_trials() — nightly sweep ─────────────────────────────────
create or replace function public.expire_promo_trials()
returns integer
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_count integer;
begin
  update practice_settings
     set subscription_status = 'inactive'
   where subscription_status = 'trialing'
     and stripe_subscription_id is null
     and promo_trial_ends_at is not null
     and promo_trial_ends_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$func$;

revoke execute on function public.expire_promo_trials() from public, anon, authenticated;

select cron.schedule(
  'expire-promo-trials',
  '15 2 * * *',            -- 02:15 UTC daily
  'select public.expire_promo_trials()'
);

-- ── Seed the launch code: 2 months free ──────────────────────────────────
insert into public.promo_codes (code, months_free, note)
values ('LAUNCH', 2, 'Launch promo — 2 months free for access-token signups')
on conflict (code) do nothing;

notify pgrst, 'reload schema';
