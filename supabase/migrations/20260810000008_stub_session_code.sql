-- Add optional reference/promo code to stub sessions.
alter table public.stub_sessions
  add column if not exists code text;
