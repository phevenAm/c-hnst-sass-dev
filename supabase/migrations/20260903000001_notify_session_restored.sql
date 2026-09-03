-- ─────────────────────────────────────────────────────────────────────────────
-- Restoring a cancelled session was invisible to the client
--
-- restoreSession() (useSessionCard.tsx) just flips status back to 'scheduled'
-- and shows the admin a toast. Unlike cancel / reschedule there was:
--   * no session_events row (the session-card timeline showed nothing), and
--   * no client notification or email.
--
-- This migration adds the 'restored' timeline event. The client notification +
-- email are sent by the new notify-session-restored edge function, which the
-- FE now invokes from restoreSession() — mirroring notify-session-cancelled.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Allow the new event / email types ──────────────────────────────────────
alter table public.session_events
  drop constraint if exists session_events_event_type_check;

alter table public.session_events
  add constraint session_events_event_type_check check (
    event_type = any (array[
      'scheduled', 'rescheduled', 'cancelled', 'restored',
      'paid', 'unpaid', 'attended', 'no_show'
    ]::text[])
  );

alter table public.email_logs
  drop constraint if exists email_logs_email_type_check;

alter table public.email_logs
  add constraint email_logs_email_type_check check (
    email_type = any (array[
      'session_reminder', 'session_booked', 'session_cancelled', 'session_rescheduled',
      'session_restored',
      'payment_reminder', 'payment_confirmed', 'questionnaire_assigned',
      'stub_invite', 'stub_joined', 'feedback', 'reschedule_request', 'client_invite',
      'account_deactivated', 'account_reactivated', 'account_closed',
      'agency_member_invite', 'agency_client_assigned'
    ]::text[])
  );

-- ── Log a 'restored' event on cancelled -> scheduled ───────────────────────
create or replace function public.log_session_update_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- date moved
  if new.scheduled_at is distinct from old.scheduled_at then
    insert into public.session_events(session_id, event_type, metadata)
    values (
      new.id,
      'rescheduled',
      jsonb_build_object('from', old.scheduled_at, 'to', new.scheduled_at)
    );
  end if;

  -- cancelled
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.session_events(session_id, event_type)
    values (new.id, 'cancelled');
  end if;

  -- restored (cancelled -> scheduled)
  if new.status = 'scheduled' and old.status = 'cancelled' then
    insert into public.session_events(session_id, event_type)
    values (new.id, 'restored');
  end if;

  -- payment toggled
  if new.paid is distinct from old.paid then
    insert into public.session_events(session_id, event_type)
    values (new.id, case when new.paid then 'paid' else 'unpaid' end);
  end if;

  -- attendance toggled
  if new.attended is distinct from old.attended and new.attended is not null then
    insert into public.session_events(session_id, event_type)
    values (new.id, case when new.attended then 'attended' else 'no_show' end);
  end if;

  return new;
end;
$function$;
