-- Enable pg_cron (requires the extension to be enabled in the Supabase dashboard
-- under Database → Extensions → pg_cron before this migration runs).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cancel real sessions that are past their scheduled time and unpaid.
-- Also cancels stub sessions that are past and have no recorded payment.
CREATE OR REPLACE FUNCTION auto_cancel_unpaid_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  UPDATE sessions
  SET status = 'cancelled'
  WHERE status = 'scheduled'
    AND scheduled_at < NOW()
    AND paid = false;

  UPDATE stub_sessions
  SET status = 'cancelled'
  WHERE status = 'scheduled'
    AND scheduled_at < NOW()
    AND amount_paid IS NULL;
END;
$func$;

-- Run once per hour. Adjust the cron expression to taste.
SELECT cron.schedule(
  'auto-cancel-unpaid-sessions',
  '0 * * * *',
  'SELECT auto_cancel_unpaid_sessions()'
);
