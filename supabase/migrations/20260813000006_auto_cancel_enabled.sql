-- Add opt-in auto-cancel toggle to practice_settings.
-- Defaults to false — practitioners must explicitly enable it.
alter table public.practice_settings
  add column if not exists auto_cancel_enabled boolean not null default false;
