-- Configurable post-session "buffer" strip on the scheduler calendar.
--
-- The admin + client calendars draw a hatched strip after every booked session
-- (a cool-down / notes gap). Its length was hard-coded to 10 minutes; this makes
-- it a practice setting so counsellors can lengthen it or switch it off (0).
--
-- Default 10 preserves the previous behaviour for every existing practice.
-- Range-checked 0..120 so the calendar can't be handed a nonsense value.

alter table public.practice_settings
  add column if not exists session_buffer_minutes integer not null default 10
  check (session_buffer_minutes >= 0 and session_buffer_minutes <= 120);

comment on column public.practice_settings.session_buffer_minutes is
  'Minutes of buffer drawn after each session on the scheduler calendar. 0 = no buffer strip.';
