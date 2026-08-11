alter table public.practice_settings
  add column if not exists cpd_custom_categories text[] not null default '{}';
