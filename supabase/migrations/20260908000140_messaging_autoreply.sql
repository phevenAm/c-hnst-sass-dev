-- Away / out-of-hours auto-reply for direct messaging.
--
-- When a client messages their practitioner and the practitioner is away
-- (a holiday window, or simply outside their configured office hours), an
-- automatic reply is posted back into the thread on their behalf. Delivery is
-- handled by the notify-new-message edge function, which already fires on
-- every send and loads the practitioner's practice_settings.
--
--   practice_settings.msg_autoreply_enabled  master switch
--   practice_settings.msg_autoreply_text     what the client sees
--   practice_settings.msg_away_until         inclusive date — away up to & incl.
--   practice_settings.msg_office_hours        jsonb: { days:[1..7 (Mon..Sun)],
--                                             from:"HH:MM", to:"HH:MM", tz:IANA }
--                                             null = no hours rule (holiday only,
--                                             or "always away" when enabled with
--                                             no away_until either)
--
--   conversations.autoreply_at   last auto-reply time — a cooldown so a burst of
--                                client messages gets one "I'm away", not many.
--   messages.is_auto             marks the row as an automatic reply (the client
--                                UI tags it).

alter table public.practice_settings
  add column if not exists msg_autoreply_enabled boolean not null default false,
  add column if not exists msg_autoreply_text    text,
  add column if not exists msg_away_until         date,
  add column if not exists msg_office_hours       jsonb;

alter table public.conversations
  add column if not exists autoreply_at timestamptz;

alter table public.messages
  add column if not exists is_auto boolean not null default false;

notify pgrst, 'reload schema';
