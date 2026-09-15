-- Per-chart "which series are hidden" preference for the toggleable trend
-- legends (Admin Dashboard's Practice Trends widget, Finance page's
-- Overview chart) — was a plain useState, so it reset on every reload.
-- Keyed by an arbitrary chart id (e.g. "practiceTrends", "financeOverview")
-- to an array of hidden series keys, so unrelated charts don't collide even
-- though they reuse a key name like "Outgoings".
alter table public.practice_settings
  add column if not exists hidden_chart_series jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
