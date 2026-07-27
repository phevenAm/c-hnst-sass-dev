alter table public.practice_settings
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_onboarded boolean not null default false,
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_customer_id text;

-- Existing admins are already set up manually, mark them active so they're not locked out
update public.practice_settings
set subscription_status = 'active'
where admin_id in (
  select id from public.users where role = 'admin'
);
