alter table public.practice_settings
  add column if not exists reduce_motion boolean not null default false;
