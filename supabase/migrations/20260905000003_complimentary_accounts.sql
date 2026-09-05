-- Manually-comped practices (paying Stephen outside Stripe) need a durable,
-- self-documenting marker — without one, a future look at practice_settings
-- finds subscription_status = 'active' with no stripe_subscription_id and no
-- billing history, and reads as a billing bug rather than an intentional
-- exemption. The app's paywall gate only ever checks subscription_status
-- (see Router.tsx), so complimentary doesn't need any frontend change to
-- take effect — it's purely a record of *why* status is pinned to active.
alter table public.practice_settings
  add column if not exists complimentary boolean not null default false,
  add column if not exists complimentary_reason text;

update public.practice_settings
set subscription_status = 'active',
    complimentary = true,
    complimentary_reason = 'Abide Counselling — pays Stephen directly outside Stripe, 2026-09-05'
where admin_id in (
  select id from auth.users where email in ('rosiemissah@outlook.com', 'abidecounselling@outlook.com')
);
