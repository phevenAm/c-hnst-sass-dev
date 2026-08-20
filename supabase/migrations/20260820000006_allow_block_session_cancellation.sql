-- request-cancel-session only ever blocked a block session from being
-- individually cancel-requested once that block was already paid — an
-- unpaid block session could still be requested for cancellation like any
-- normal session. Admins want to decide this themselves rather than have
-- it depend on payment state: default true (today's actual behaviour —
-- cancellation requests work as normal) so nothing changes until an admin
-- deliberately turns it off.
alter table public.practice_settings
  add column if not exists allow_block_session_cancellation boolean not null default true;
