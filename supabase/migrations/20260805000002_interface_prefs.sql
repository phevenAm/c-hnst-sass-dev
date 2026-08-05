-- Stores which UI sections the admin has hidden.
-- Values are section IDs e.g. 'dashboard-revenue', 'dashboard-todos'.
alter table public.practice_settings
  add column if not exists hidden_sections text[] not null default '{}';
