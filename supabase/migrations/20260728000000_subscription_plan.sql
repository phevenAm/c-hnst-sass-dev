-- Add subscription_plan to practice_settings so we know which product tier each admin is on.
-- Values: 'website' | 'app' | 'bundle'. Defaults to 'app' for existing subscribers.

alter table public.practice_settings
  add column if not exists subscription_plan text not null default 'app';

-- Existing active subscribers get 'app' — update if you know their actual plan.
comment on column public.practice_settings.subscription_plan is
  'Stripe product tier: website | app | bundle';
