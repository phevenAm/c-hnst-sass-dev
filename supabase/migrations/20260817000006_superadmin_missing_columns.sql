-- get-all-practices queries users.disabled and practice_settings.updated_at
-- but neither column exists in migrations. If missing, PostgREST returns a
-- 400 (column not found) which becomes the 500 the superadmin page sees.

-- Add disabled flag to users (soft-delete / account suspension)
alter table public.users
  add column if not exists disabled boolean not null default false;

-- Add updated_at timestamp to practice_settings (used for ordering in superadmin)
alter table public.practice_settings
  add column if not exists updated_at timestamptz not null default now();

-- Auto-update updated_at when practice_settings changes
drop trigger if exists practice_settings_updated_at on public.practice_settings;
create trigger practice_settings_updated_at
  before update on public.practice_settings
  for each row execute function public.touch_updated_at();
