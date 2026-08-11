alter table public.cpd_logs
  add column if not exists custom_category text;
