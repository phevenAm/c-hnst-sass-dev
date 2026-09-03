-- Auto-cancel semantics, corrected.
--
-- Previous behaviour: cancel an unpaid session once its start was within
-- `payment_deadline_hours` (default 48) of now — i.e. it deleted sessions up to
-- TWO DAYS BEFORE they were due. A live practitioner had future sessions
-- vanish, and every manual restore was undone on the next hourly tick because
-- the session was still unpaid and still inside that window.
--
-- New behaviour (what the practitioner actually expects):
--   * only when the practice has explicitly turned it on
--     (practice_settings.auto_cancel_enabled = true),
--   * only once the session has actually ENDED (start + duration < now),
--   * only if still unpaid.
-- payment_deadline_hours no longer has any bearing on auto-cancel; a practice
-- that hasn't opted in is never touched (no more "no settings row" fallback).

create or replace function public.auto_cancel_unpaid_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_session_id uuid;
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'internal_auto_cancel_secret');
begin
  -- ── Real sessions: cancel + email each affected client ────────────────────
  for v_session_id in
    update public.sessions s
    set status = 'cancelled',
        manual_payment_status = 'none'
    from public.practice_settings ps
    where ps.admin_id            = s.created_by
      and ps.auto_cancel_enabled = true
      and s.status               = 'scheduled'
      and s.paid                 = false
      and s.scheduled_at + make_interval(mins => coalesce(s.duration_minutes, 50)) < now()
    returning s.id
  loop
    perform net.http_post(
      url     := 'https://mxyfdvfbdrusbjiozuzx.supabase.co/functions/v1/notify-auto-cancelled',
      body    := jsonb_build_object('session_id', v_session_id),
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'x-internal-secret', v_secret
      )
    );
  end loop;

  -- ── Stub sessions: cancel only (offline clients have no email) ────────────
  update public.stub_sessions ss
  set status = 'cancelled'
  from public.practice_settings ps
  where ps.admin_id            = ss.admin_id
    and ps.auto_cancel_enabled = true
    and ss.status              = 'scheduled'
    and ss.amount_paid         is null
    and ss.scheduled_at + make_interval(mins => coalesce(ss.duration_minutes, 50)) < now();
end;
$func$;
