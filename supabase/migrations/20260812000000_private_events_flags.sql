alter table public.admin_private_events
  add column if not exists is_supervision boolean not null default false,
  add column if not exists is_cpd boolean not null default false;
