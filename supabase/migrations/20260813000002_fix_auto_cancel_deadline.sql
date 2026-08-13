-- Fix auto_cancel_unpaid_sessions to respect each practice's payment_deadline_hours.
--
-- Old behaviour: cancel sessions where scheduled_at < NOW() (only after they occurred).
-- New behaviour: cancel unpaid sessions whose scheduled time is within (or past) the
--   practice's payment_deadline_hours window — matching the logic already in the
--   send-session-reminders edge function.
--
-- "payment_deadline_hours = 48" means a client must pay at least 48 hours before their
-- session; if they haven't, the session is cancelled on the next hourly cron tick.

CREATE OR REPLACE FUNCTION public.auto_cancel_unpaid_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- ── Real sessions (per-practice deadline) ───────────────────────────────────
  UPDATE public.sessions s
  SET status = 'cancelled'
  FROM public.practice_settings ps
  WHERE ps.admin_id = s.created_by
    AND s.status   = 'scheduled'
    AND s.paid     = false
    AND s.scheduled_at <= NOW() + (ps.payment_deadline_hours * interval '1 hour');

  -- Fallback: practices with no settings row yet (use 48 h default)
  UPDATE public.sessions s
  SET status = 'cancelled'
  WHERE s.status   = 'scheduled'
    AND s.paid     = false
    AND s.scheduled_at <= NOW() + interval '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.practice_settings ps WHERE ps.admin_id = s.created_by
    );

  -- ── Stub sessions (per-practice deadline) ───────────────────────────────────
  UPDATE public.stub_sessions ss
  SET status = 'cancelled'
  FROM public.practice_settings ps
  WHERE ps.admin_id = ss.admin_id
    AND ss.status      = 'scheduled'
    AND ss.amount_paid IS NULL
    AND ss.scheduled_at <= NOW() + (ps.payment_deadline_hours * interval '1 hour');

  -- Fallback: stub sessions for practices with no settings row
  UPDATE public.stub_sessions ss
  SET status = 'cancelled'
  WHERE ss.status      = 'scheduled'
    AND ss.amount_paid IS NULL
    AND ss.scheduled_at <= NOW() + interval '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.practice_settings ps WHERE ps.admin_id = ss.admin_id
    );
END;
$func$;
