-- ─────────────────────────────────────────────────────────────────────────────
-- Client announcements — one-to-many email from a practice to selected clients
-- (news, closures, waiting-list updates). The actual send + per-recipient
-- email_logs rows are done by the `broadcast-email` edge function; this table
-- is the practice-facing record of what went out and to how many.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.announcements (
  id              uuid        primary key default gen_random_uuid(),
  admin_id        uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  subject         text        not null,
  body            text        not null,
  attachment_url  text,
  recipient_ids   uuid[]      not null default '{}',
  recipient_count integer     not null default 0,
  sent_count      integer     not null default 0,
  skipped_count   integer     not null default 0,
  created_at      timestamptz not null default now()
);

create index announcements_admin_idx on public.announcements (admin_id, created_at desc);

alter table public.announcements enable row level security;

-- Read for the practice; writes go through the service-role edge function.
create policy "admins read own announcements"
  on public.announcements for select
  using (admin_id = auth.uid());

notify pgrst, 'reload schema';
