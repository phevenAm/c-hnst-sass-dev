-- Add paid_at to sessions so the payments page can show when payments were received.
alter table public.sessions
  add column if not exists paid_at timestamptz;
