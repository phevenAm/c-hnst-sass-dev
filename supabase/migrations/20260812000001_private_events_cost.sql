alter table public.admin_private_events
  add column if not exists cost_pence integer,
  add column if not exists currency  text not null default 'GBP';
