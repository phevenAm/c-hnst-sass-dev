alter table public.practice_settings
  add column if not exists saved_locations jsonb not null default '[]'::jsonb;
