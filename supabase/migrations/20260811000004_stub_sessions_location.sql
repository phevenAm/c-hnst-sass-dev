-- Add location text field to stub_sessions so offline client sessions
-- can record where they took place (mirrors the sessions.address column).
alter table public.stub_sessions
  add column if not exists location text;
