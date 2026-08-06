alter table public.sessions
  add column if not exists reference_code text;
